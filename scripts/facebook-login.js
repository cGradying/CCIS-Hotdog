// Facebook OAuth login helper using a Meta app ID as the client.
// Opens your browser for authorization, catches the callback, exchanges the
// code for a user access token, then lists the pages you manage via /me/accounts
// and saves the computetech page token to .facebook-mcp.json (gitignored).
// Run:  node scripts/facebook-login.js <APP_ID>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', '.facebook-mcp.json');

const APP_ID = process.argv[2];
if (!APP_ID) {
  console.error('usage: node scripts/facebook-login.js <APP_ID>');
  process.exit(1);
}

const AUTH = 'https://www.facebook.com/v26.0/dialog/oauth';
const TOKEN = 'https://graph.facebook.com/v26.0/oauth/access_token';
const GRAPH = 'https://graph.facebook.com/v26.0';
const PORT = 8977;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `cmd /c start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd);
}

function authorize(challenge, state) {
  const params = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  return `${AUTH}?${params.toString()}`;
}

function waitForCallback() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding-top:60px">' +
          '<h2>Logged in</h2><p>You can close this tab and return to opencode.</p></body></html>'
      );
      server.close();
      if (url.searchParams.get('error')) reject(new Error(url.searchParams.get('error_description') || url.searchParams.get('error')));
      else resolve(url.searchParams.get('code'));
    });
    server.listen(PORT, '127.0.0.1', () => console.log(`[facebook-login] waiting for callback on ${REDIRECT}`));
    server.on('error', reject);
  });
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT,
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
  });
  const res = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`token exchange failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function graph(pathname, accessToken) {
  const res = await fetch(`${GRAPH}${pathname}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  return res.json();
}

const verifier = crypto.randomBytes(48).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');

openBrowser(authorize(challenge, state));
console.log('[facebook-login] browser opened — please log in and authorize (the account that manages the Page).');
console.log('[facebook-login] if it errors with a redirect_uri mismatch, add this exact URI to your app\'s Facebook Login settings:');
console.log(`[facebook-login]   ${REDIRECT}`);

const code = await waitForCallback();
const token = await exchangeCode(code, verifier);
if (token.error) throw new Error(`token error: ${token.error} ${token.error_description || ''}`);

const userToken = token.access_token;
console.log('[facebook-login] got user access token');
if (!token.refresh_token) console.log('[facebook-login] WARNING: no refresh_token in response:', JSON.stringify(token).slice(0, 200));

const accounts = await graph('/me/accounts', userToken);
if (accounts.error) throw new Error(`/me/accounts failed: ${accounts.error.message}`);
if (!Array.isArray(accounts.data) || accounts.data.length === 0) {
  throw new Error('no pages found for this user — the account must manage the computetech Page');
}

const page = accounts.data.find((p) => p.name && p.name.toLowerCase().includes('computetech')) || accounts.data[0];
fs.writeFileSync(
  TOKEN_FILE,
  JSON.stringify(
    {
      client_id: APP_ID,
      refresh_token: token.refresh_token || null,
      user_access_token: userToken,
      page: { id: page.id, name: page.name, access_token: page.access_token },
      obtainedAt: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log('[facebook-login] token saved to', TOKEN_FILE);
console.log('[facebook-login] page:', page.name, `(id ${page.id})`);
console.log('[facebook-login] found pages:', accounts.data.map((p) => `${p.name} (${p.id})`).join(', '));

// Keep the pipeline's .env in sync with the fresh page token.
const ENV_FILE = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_FILE)) {
  let env = fs.readFileSync(ENV_FILE, 'utf8');
  const setOrAdd = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    return re.test(env) ? env.replace(re, `${key}=${value}`) : `${env.replace(/\s*$/, '')}\n${key}=${value}\n`;
  };
  env = setOrAdd('FACEBOOK_PAGE_ID', page.id);
  env = setOrAdd('FACEBOOK_PAGE_ACCESS_TOKEN', page.access_token);
  fs.writeFileSync(ENV_FILE, env);
  console.log('[facebook-login] .env updated with fresh page token');
} else {
  console.log('[facebook-login] .env not found — skipped');
}
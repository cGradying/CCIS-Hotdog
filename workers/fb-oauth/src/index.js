// Facebook page-token OAuth helper for the bscs1nres announcement pipeline.
// Deployed to Cloudflare Workers so the OAuth callback runs over HTTPS (Facebook
// rejects plain-http loopback callbacks for this app).
//
//   GET /           -> start page
//   GET /login      -> PKCE + redirect to Facebook consent (sets verifier cookie)
//   GET /callback   -> exchange code, store tokens in KV, show the page token
//   GET /refresh    -> use stored refresh_token for a new access token (manual)
//   GET /env        -> current FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN from KV
//   GET /clear      -> delete stored tokens (re-login needed)
//
// The worker's cron trigger runs every 20 days and refreshes the token if needed.
// After deploying, add the /callback URL to the app's Valid OAuth Redirect URIs.
const APP_ID = '1102204788805535';
const BASE = 'https://bscs1nres-fb-oauth.rylsherdamz.workers.dev';
const AUTH = 'https://www.facebook.com/v26.0/dialog/oauth';
const TOKEN = 'https://graph.facebook.com/v26.0/oauth/access_token';
const GRAPH = 'https://graph.facebook.com/v26.0';
const SCOPES = 'pages_show_list,pages_manage_posts,pages_read_engagement';
const REDIRECT = `${BASE}/callback`;
const KV_KEY = 'fb_tokens';
const REFRESH_AFTER_DAYS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

function html(body) {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px"><pre style="white-space:pre-wrap;word-break:break-word">${body}</pre></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

function escapeXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

async function tokenExchange(body) {
  const res = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  return res.json();
}

async function fetchAccounts(userToken) {
  const res = await fetch(`${GRAPH}/me/accounts`, { headers: { Authorization: `Bearer ${userToken}` } });
  return res.json();
}

async function refreshTokens(env) {
  const stored = await env.FB_KV.get(KV_KEY, 'json');
  if (!stored || !stored.refresh_token) return { error: 'no stored refresh token — visit /login once to authorize' };

  const body = new URLSearchParams({
    client_id: APP_ID,
    redirect_uri: REDIRECT,
    grant_type: 'refresh_token',
    refresh_token: stored.refresh_token,
  });
  const t = await tokenExchange(body);
  if (t.error) return { error: `refresh failed: ${JSON.stringify(t)}` };

  const userToken = t.access_token;
  const a = await fetchAccounts(userToken);
  if (a.error) return { error: `refresh ok but /me/accounts failed: ${JSON.stringify(a)}` };

  const pages = a.data || [];
  const target = pages.find((p) => p.name.toLowerCase().includes('computetech'));
  const page = target || pages[0] || null;
  if (!page) return { error: 'no pages found after refresh' };

  const next = {
    refresh_token: t.refresh_token || stored.refresh_token,
    user_access_token: userToken,
    page: { id: page.id, name: page.name, access_token: page.access_token },
    updatedAt: new Date().toISOString(),
  };
  await env.FB_KV.put(KV_KEY, JSON.stringify(next));
  return next;
}

async function handleCron(env) {
  const stored = await env.FB_KV.get(KV_KEY, 'json');
  if (!stored || !stored.updatedAt) return;
  const last = new Date(stored.updatedAt).getTime();
  if (Date.now() - last >= REFRESH_AFTER_DAYS * DAY_MS) {
    const result = await refreshTokens(env);
    console.log('[fb-oauth] cron refresh:', result.error || `ok — ${result.page.name} token updated`);
  } else {
    console.log('[fb-oauth] cron refresh: not due yet');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return html('<a href="/login">Start Facebook login</a>');
    }

    if (url.pathname === '/login') {
      const verifier = crypto.randomUUID() + crypto.randomUUID() + crypto.randomUUID();
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const bytes = new Uint8Array(digest);
      let bin = '';
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      const challenge = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const state = crypto.randomUUID();
      const params = new URLSearchParams({
        client_id: APP_ID,
        redirect_uri: REDIRECT,
        response_type: 'code',
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
      });
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${AUTH}?${params}`,
          'Set-Cookie': `fb_verifier=${verifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
        },
      });
    }

    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const err = url.searchParams.get('error');
      if (err) return html(`Facebook error: ${escapeXml(err)} ${escapeXml(url.searchParams.get('error_description') || '')}`);
      if (!code) return html('missing code');
      const cookies = Object.fromEntries(
        (request.headers.get('Cookie') || '').split(';').map((c) => c.trim().split(/=(.*)/s).slice(0, 2))
      );
      const verifier = cookies.fb_verifier;
      if (!verifier) return html('missing verifier cookie — go back to /login and retry');

      const t = await tokenExchange(
        new URLSearchParams({
          client_id: APP_ID,
          redirect_uri: REDIRECT,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
        })
      );
      if (t.error) return html(`token error: ${escapeXml(JSON.stringify(t))}`);
      const userToken = t.access_token;

      const a = await fetchAccounts(userToken);
      if (a.error) return html(`/me/accounts error: ${escapeXml(JSON.stringify(a))}`);
      const pages = a.data || [];
      const target = pages.find((p) => p.name.toLowerCase().includes('computetech'));
      const page = target || pages[0] || null;
      if (!page) return html(`no pages found. user token scopes: ${escapeXml(t.scope || '?')}`);

      await env.FB_KV.put(
        KV_KEY,
        JSON.stringify({
          refresh_token: t.refresh_token || null,
          user_access_token: userToken,
          page: { id: page.id, name: page.name, access_token: page.access_token },
          updatedAt: new Date().toISOString(),
        })
      );

      return html(
        `authorized — tokens stored. Copy these into .env:<br/><br/>` +
          `FACEBOOK_PAGE_ID=${escapeXml(page.id)}<br/>` +
          `FACEBOOK_PAGE_ACCESS_TOKEN=${escapeXml(page.access_token)}<br/><br/>` +
          `page: ${escapeXml(page.name)}<br/>pages: ${escapeXml(pages.map((p) => `${p.name} (${p.id})`).join(', '))}` +
          `<br/><br/>refresh_token: ${t.refresh_token ? 'captured (cron auto-refresh armed)' : 'NOT returned — token cannot auto-refresh'}`
      );
    }

    if (url.pathname === '/refresh') {
      const result = await refreshTokens(env);
      if (result.error) return html(`refresh error: ${escapeXml(result.error)}`);
      return html(
        `refreshed. New token:<br/><br/>` +
          `FACEBOOK_PAGE_ID=${escapeXml(result.page.id)}<br/>` +
          `FACEBOOK_PAGE_ACCESS_TOKEN=${escapeXml(result.page.access_token)}<br/><br/>` +
          `updated: ${escapeXml(result.updatedAt)}`
      );
    }

    if (url.pathname === '/env') {
      const stored = await env.FB_KV.get(KV_KEY, 'json');
      if (!stored) return html('no stored tokens — visit /login first');
      return html(
        `FACEBOOK_PAGE_ID=${escapeXml(stored.page.id)}<br/>` +
          `FACEBOOK_PAGE_ACCESS_TOKEN=${escapeXml(stored.page.access_token)}<br/><br/>` +
          `page: ${escapeXml(stored.page.name)}<br/>updated: ${escapeXml(stored.updatedAt)}`
      );
    }

    if (url.pathname === '/clear') {
      await env.FB_KV.delete(KV_KEY);
      return html('stored tokens deleted — visit /login to re-authorize');
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron(env));
  },
};
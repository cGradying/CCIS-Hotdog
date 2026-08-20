// Facebook page-token OAuth helper for the bscs1nres announcement pipeline.
// Deployed to Cloudflare Workers so the OAuth callback runs over HTTPS (Facebook
// rejects plain-http loopback callbacks for this app).
//
//   GET /           -> start page
//   GET /login      -> PKCE + redirect to Facebook consent (sets verifier cookie)
//   GET /callback   -> exchange code, list pages, show the computetech page token
//
// After deploying, add the /callback URL to the app's Valid OAuth Redirect URIs.
const APP_ID = '1102204788805535';
const BASE = 'https://bscs1nres-fb-oauth.rylsherdamz.workers.dev';
const AUTH = 'https://www.facebook.com/v26.0/dialog/oauth';
const TOKEN = 'https://graph.facebook.com/v26.0/oauth/access_token';
const GRAPH = 'https://graph.facebook.com/v26.0';
const SCOPES = 'pages_show_list,pages_manage_posts';
const REDIRECT = `${BASE}/callback`;

function html(body) {
  return new Response(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 16px"><pre style="white-space:pre-wrap;word-break:break-word">${body}</pre></body></html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

function escapeXml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

export default {
  async fetch(request) {
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

      const body = new URLSearchParams({
        client_id: APP_ID,
        redirect_uri: REDIRECT,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
      });
      const tRes = await fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const tJson = await tRes.json();
      if (tJson.error) return html(`token error: ${escapeXml(JSON.stringify(tJson))}`);
      const userToken = tJson.access_token;

      const aRes = await fetch(`${GRAPH}/me/accounts`, { headers: { Authorization: `Bearer ${userToken}` } });
      const aJson = await aRes.json();
      if (aJson.error) return html(`/me/accounts error: ${escapeXml(JSON.stringify(aJson))}`);
      const pages = aJson.data || [];
      const target = pages.find((p) => p.name.toLowerCase().includes('computetech'));
      const page = target || pages[0] || null;
      if (!page) return html(`no pages found. user token scopes: ${escapeXml(tJson.scope || '?')}`);
      return html(
        `page token OK — copy these into .env<br/><br/>` +
          `FACEBOOK_PAGE_ID=${escapeXml(page.id)}<br/>` +
          `FACEBOOK_PAGE_ACCESS_TOKEN=${escapeXml(page.access_token)}<br/><br/>` +
          `page: ${escapeXml(page.name)}<br/>pages: ${escapeXml(pages.map((p) => `${p.name} (${p.id})`).join(', '))}`
      );
    }

    return new Response('not found', { status: 404 });
  },
};
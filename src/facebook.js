import fs from 'node:fs';

const GRAPH_API = 'https://graph.facebook.com';

// Posts an image + caption to a Facebook Page using the Graph API. Requires a
// long-lived Page access token. Returns { skipped: true } when not configured
// so the rest of the pipeline still runs.
export async function postToFacebookPage({ pageId, accessToken, message, imagePath }) {
  if (!pageId || !accessToken) {
    return { skipped: true, reason: 'FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN not configured' };
  }

  const form = new FormData();
  form.append('access_token', accessToken);
  form.append('message', message);
  if (imagePath && fs.existsSync(imagePath)) {
    form.append('source', new Blob([fs.readFileSync(imagePath)]), { filename: 'poster.png' });
  }

  const res = await fetch(`${GRAPH_API}/v19.0/${pageId}/photos`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Facebook API error: ${JSON.stringify(data.error || data)}`);
  }
  return { id: data.id, postId: data.post_id || null, skipped: false };
}
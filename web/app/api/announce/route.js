import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Pure-HTTP helpers for the announcement publisher. Everything is server-side on
// the Worker: emails are pulled from the public Google Sheet CSV export, the
// mailto link is built here, and Facebook / Discord sends are raw REST calls.
// Secrets (DISCORD_TOKEN, FACEBOOK_PAGE_ACCESS_TOKEN) must be set as Worker
// secrets via `wrangler secret put` — never in wrangler.toml.

function csvToRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function sheetToCsvExportUrl(url) {
  const str = String(url || '');
  const match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const gid = new URL(str, 'https://docs.google.com').searchParams.get('gid');
    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
  }
  if (str.includes('/export')) return str;
  return str;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase().replace(/^mailto:/i, '');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function fetchEmails(sheetUrl, emailColumn = 'Email') {
  if (!sheetUrl) return [];
  const res = await fetch(sheetToCsvExportUrl(sheetUrl));
  if (!res.ok) throw new Error(`Sheets fetch failed (${res.status})`);
  const rows = csvToRows(await res.text());
  if (!rows.length) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const column = header.indexOf(String(emailColumn).trim().toLowerCase());
  if (column === -1) return [];
  const seen = new Set();
  const emails = [];
  for (let i = 1; i < rows.length; i++) {
    const raw = normalizeEmail(rows[i][column]);
    if (!raw || seen.has(raw) || !isValidEmail(raw)) continue;
    seen.add(raw);
    emails.push(raw);
  }
  return emails;
}

function buildMailto({ bcc, subject, body }) {
  const params = new URLSearchParams({ subject, body });
  if (bcc.length) params.set('bcc', bcc.join(','));
  return `mailto:?${params.toString()}`;
}

async function postToFacebook({ pageId, accessToken, message, imagePath }) {
  if (!pageId || !accessToken) return { skipped: true, reason: 'not configured' };
  const form = new FormData();
  form.append('access_token', accessToken);
  form.append('message', message);
  if (imagePath) {
    form.append('source', new Blob([Buffer.from(imagePath, 'base64')], { type: 'image/png' }), { filename: 'poster.png' });
    const res = await fetch(`https://graph.facebook.com/v26.0/${pageId}/photos`, { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(`Facebook API error: ${JSON.stringify(data.error || data)}`);
    return { id: data.id, postId: data.post_id || null, skipped: false };
  }
  const res = await fetch(`https://graph.facebook.com/v26.0/${pageId}/feed`, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Facebook API error: ${JSON.stringify(data.error || data)}`);
  return { id: data.id, skipped: false };
}

async function sendDiscord({ token, channelId, title, description, imageDataUrl }) {
  if (!token || !channelId) return { skipped: true, reason: 'not configured' };
  const embed = {
    color: 0x2ab7ca,
    title: `📣 ${title}`,
    description,
    footer: { text: 'Announced via pipeline' },
  };
  const payload = { embeds: [embed] };
  let body;
  let headers = { Authorization: `Bot ${token}` };
  if (imageDataUrl) {
    const base64 = String(imageDataUrl).split(',')[1] || '';
    const form = new FormData();
    form.append('payload_json', JSON.stringify({ ...payload, attachments: [{ id: '0', filename: 'poster.png' }] }));
    form.append('files[0]', new Blob([Buffer.from(base64, 'base64')], { type: 'image/png' }), 'poster.png');
    body = form;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, { method: 'POST', headers, body });
  const data = await res.json();
  if (!res.ok) throw new Error(`Discord API error: ${JSON.stringify(data)}`);
  return { id: data.id, skipped: false };
}

export async function POST(request) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken) {
    const auth = request.headers.get('authorization') || '';
    if (auth !== `Bearer ${adminToken}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const {
    title,
    description,
    meetingLink,
    meetingDatetime,
    imageDataUrl = null,
    targets = {}, // { email: bool, facebook: bool, discord: bool }
    sheetUrl = process.env.GOOGLE_SHEET_URL,
    emailColumn = process.env.SHEET_EMAIL_COLUMN || 'Email',
    subject,
  } = input;

  const results = { emails: [], mailtoUri: null, facebook: null, discord: null, errors: [] };
  const detailLines = [];
  if (meetingDatetime) detailLines.push(`📅 When: ${meetingDatetime}`);
  if (meetingLink) detailLines.push(`🔗 Meeting link: ${meetingLink}`);
  const emailBody = [description, ...detailLines].filter(Boolean).join('\n\n');
  const discordDescription = [
    description,
    meetingDatetime ? `📅 **When:** ${meetingDatetime}` : null,
    meetingLink ? `🔗 **Join:** ${meetingLink}` : null,
  ].filter(Boolean).join('\n\n');
  const facebookMessage = [title, description, ...detailLines].filter(Boolean).join('\n\n');

  if (targets.email) {
    try {
      results.emails = await fetchEmails(sheetUrl, emailColumn);
      results.mailtoUri = buildMailto({ bcc: results.emails, subject: subject || title, body: emailBody });
    } catch (err) {
      results.errors.push({ step: 'email', message: err.message });
    }
  }

  if (targets.facebook) {
    try {
      results.facebook = await postToFacebook({
        pageId: process.env.FACEBOOK_PAGE_ID,
        accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
        message: facebookMessage,
        imagePath: imageDataUrl,
      });
    } catch (err) {
      results.errors.push({ step: 'facebook', message: err.message });
    }
  }

  if (targets.discord) {
    try {
      results.discord = await sendDiscord({
        token: process.env.DISCORD_TOKEN,
        channelId: process.env.ANNOUNCEMENT_CHANNEL_ID,
        title,
        description: discordDescription,
        imageDataUrl,
      });
    } catch (err) {
      results.errors.push({ step: 'discord', message: err.message });
    }
  }

  return NextResponse.json(results);
}
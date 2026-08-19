import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from './config.js';

export function createTransport() {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: config.gmailUser, pass: config.gmailAppPassword },
  });
}

// HTML body with an optional inline poster (referenced by cid). Text content
// and links stay consistent with announcement.js.
export function buildHtmlBody(announcement, posterCid) {
  const when = announcement.meetingDatetime
    ? `<p style="margin:18px 0 0"><b>📅 When:</b> ${announcement.meetingDatetime}</p>`
    : '';
  const link = announcement.meetingLink
    ? `<p style="margin:18px 0 0"><b>🔗 Meeting link:</b> <a href="${announcement.meetingLink}">${announcement.meetingLink}</a></p>
       <p style="margin:26px 0 0"><a href="${announcement.meetingLink}" style="background:#2ab7ca;color:#0b1120;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:bold;display:inline-block">Join the meeting</a></p>`
    : '';
  const poster = posterCid
    ? `<p style="margin:28px 0 0"><img src="cid:${posterCid}" alt="${announcement.title}" style="max-width:100%;border-radius:14px"/></p>`
    : '';

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0b1120">
    <h1 style="font-size:26px;margin:0 0 16px">${announcement.title}</h1>
    <p style="font-size:16px;line-height:1.6;white-space:pre-wrap;margin:0">${announcement.description}</p>
    ${when}
    ${link}
    ${poster}
    <p style="color:#64748b;font-size:12px;margin-top:36px">Sent by ${announcement.fromName}</p>
  </div>`;
}

// Sends ONE email to `to` with everyone else in BCC — recipients never see the
// full list. Requires Gmail SMTP configured (app password).
export async function sendAnnouncementEmail({ to, bcc, subject, html, text, posterPath }) {
  const transport = createTransport();
  const attachments =
    posterPath && fs.existsSync(posterPath)
      ? [{ filename: path.basename(posterPath), path: posterPath, cid: 'poster' }]
      : [];

  const info = await transport.sendMail({
    from: `"${config.emailFromName}" <${config.gmailUser}>`,
    to,
    bcc,
    subject,
    html,
    text,
    attachments,
  });
  return { messageId: info.messageId, accepted: info.accepted?.length ?? 0 };
}

// Manual-send fallback: a mailto: link with every recipient BCC'd. Long lists
// exceed browser URL limits, so this is mainly useful as a small-list receipt.
export function buildMailto({ bcc, subject, body }) {
  const params = new URLSearchParams({ subject, body });
  if (bcc.length) params.set('bcc', bcc.join(','));
  return `mailto:?${params.toString()}`;
}

// Writes the receipt: full JSON audit, the mailto link, and a bare CSV of
// recipients. Saved under config.outputDir with a timestamp.
export function writeReceipt({ recipients, subject, emailResult, facebookResult, mailtoUri, outputDir }) {
  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(outputDir, stamp);

  const receipt = {
    generatedAt: new Date().toISOString(),
    subject,
    recipientCount: recipients.length,
    recipients,
    emailResult,
    facebookResult,
    mailtoUri,
  };
  const file = `${base}.json`;
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
  fs.writeFileSync(`${base}-mailto.txt`, mailtoUri);
  fs.writeFileSync(`${base}-recipients.csv`, recipients.join('\n') + (recipients.length ? '\n' : ''));
  return file;
}
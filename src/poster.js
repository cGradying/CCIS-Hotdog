import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 1200;
const PADDING = 60;
const NAVY = '#0b1120';

function escXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrap(text, maxChars) {
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Falls back through a few candidate backgrounds so a missing banner never
// blocks the pipeline — worst case it renders on a solid navy canvas.
export function resolveBackground(candidates) {
  for (const file of candidates) {
    if (file && fs.existsSync(file)) return file;
  }
  return null;
}

// Composites the announcement title + description (plus a meeting CTA when one
// exists) over the background image and writes a PNG ready for email/Facebook.
export async function generatePoster({ title, description, meetingLink, backgroundPath, outputPath }) {
  const titleLines = wrap(title, 30);
  const descLines = wrap(description, 44).slice(0, 6);

  const titleFont = titleLines.length > 2 ? 60 : 82;
  const titleGap = titleFont + 20;
  const titleBlockHeight = titleLines.length * titleGap + 40;
  const descBlockHeight = descLines.length * 54;
  const ctaHeight = meetingLink ? 110 : 0;
  const contentHeight = titleBlockHeight + descBlockHeight + ctaHeight;
  const height = Math.max(630, PADDING * 2 + contentHeight);

  const titleY = PADDING + titleFont + 10;
  const descY = titleY + titleLines.length * titleGap + 30;
  const ctaY = height - PADDING - 40;

  const scrim = `<linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(11,17,32,0.62)"/>
      <stop offset="0.65" stop-color="rgba(11,17,32,0.30)"/>
      <stop offset="1" stop-color="rgba(11,17,32,0.72)"/>
    </linearGradient>`;

  const titleNodes = titleLines
    .map(
      (line, i) =>
        `<text x="${PADDING}" y="${titleY + i * titleGap}" font-family="Arial, Helvetica, sans-serif" font-size="${titleFont}" font-weight="bold" fill="#ffffff">${escXml(line)}</text>`
    )
    .join('');

  const descNodes = descLines
    .map(
      (line, i) =>
        `<text x="${PADDING}" y="${descY + i * 54}" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#e2e8f0">${escXml(line)}</text>`
    )
    .join('');

  const ctaNodes = meetingLink
    ? `<rect x="${PADDING}" y="${ctaY}" width="340" height="64" rx="32" fill="#2ab7ca"/>
       <text x="${PADDING + 170}" y="${ctaY + 41}" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="bold" fill="#0b1120" text-anchor="middle">JOIN THE MEETING</text>`
    : '';

  const svg = `<svg width="${WIDTH}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>${scrim}</defs>
  <rect width="${WIDTH}" height="${height}" fill="url(#scrim)"/>
  ${titleNodes}
  ${descNodes}
  ${ctaNodes}
</svg>`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const source = backgroundPath
    ? sharp(backgroundPath)
    : sharp({ create: { width: WIDTH, height, channels: 3, background: NAVY } });

  await source
    .resize(WIDTH, height, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}
'use client';

import { useRef, useState } from 'react';

const PRESETS = ['/banners/ocean-banner.png'];

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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load background image'));
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default function AnnouncementStudio() {
  const [title, setTitle] = useState('First Year Orientation');
  const [description, setDescription] = useState(
    'Welcome to BSCS 1N! Meet your blockmates, get the syllabus, and learn how to submit and pull resources.'
  );
  const [meetingLink, setMeetingLink] = useState('https://meet.google.com/xyz');
  const [meetingDatetime, setMeetingDatetime] = useState('Aug 25, 2026 · 10:00 AM');
  const [background, setBackground] = useState(PRESETS[0]);
  const [posterUrl, setPosterUrl] = useState(null);
  const fileRef = useRef(null);

  async function buildPoster() {
    const canvas = document.createElement('canvas');
    const WIDTH = 1200;
    const HEIGHT = 630;
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');

    const bg = await loadImage(background);
    const scale = Math.max(WIDTH / bg.naturalWidth, HEIGHT / bg.naturalHeight);
    const sw = bg.naturalWidth * scale;
    const sh = bg.naturalHeight * scale;
    ctx.drawImage(bg, (WIDTH - sw) / 2, (HEIGHT - sh) / 2, sw, sh);

    const scrim = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    scrim.addColorStop(0, 'rgba(11,17,32,0.62)');
    scrim.addColorStop(0.65, 'rgba(11,17,32,0.30)');
    scrim.addColorStop(1, 'rgba(11,17,32,0.72)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const titleLines = wrap(title, 30);
    const titleFont = titleLines.length > 2 ? 60 : 82;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${titleFont}px Arial, Helvetica, sans-serif`;
    let y = 60 + titleFont;
    for (const line of titleLines) {
      ctx.fillText(line, 60, y);
      y += titleFont + 20;
    }

    const descLines = wrap(description, 44).slice(0, 6);
    y += 30;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '32px Arial, Helvetica, sans-serif';
    for (const line of descLines) {
      ctx.fillText(line, 60, y);
      y += 54;
    }

    if (meetingLink) {
      const btnY = HEIGHT - 60 - 32;
      ctx.fillStyle = '#2ab7ca';
      roundRect(ctx, 60, btnY, 340, 64, 32);
      ctx.fill();
      ctx.fillStyle = '#0b1120';
      ctx.font = 'bold 28px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('JOIN THE MEETING', 60 + 170, btnY + 41);
      ctx.textAlign = 'left';
    }

    setPosterUrl(canvas.toDataURL('image/png'));
  }

  function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBackground(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-2xl border border-navy-800 bg-navy-900 p-6">
        <h2 className="text-xl font-bold">Announcement details</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border border-navy-700 bg-navy-950 px-4 py-2.5 text-sm text-slate-100 focus:border-ocean-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">Description / content</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="resize-y rounded-xl border border-navy-700 bg-navy-950 px-4 py-2.5 text-sm text-slate-100 focus:border-ocean-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">Meeting link (optional)</span>
          <input
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            className="rounded-xl border border-navy-700 bg-navy-950 px-4 py-2.5 text-sm text-slate-100 focus:border-ocean-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">Date / time</span>
          <input
            value={meetingDatetime}
            onChange={(e) => setMeetingDatetime(e.target.value)}
            className="rounded-xl border border-navy-700 bg-navy-950 px-4 py-2.5 text-sm text-slate-100 focus:border-ocean-500 focus:outline-none"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-300">Background image</span>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((src) => (
              <button
                key={src}
                type="button"
                onClick={() => setBackground(src)}
                className={`h-14 w-24 overflow-hidden rounded-lg border-2 transition-colors ${
                  background === src ? 'border-ocean-400' : 'border-navy-700 hover:border-navy-600'
                }`}
              >
                <img src={src} alt="preset background" className="h-full w-full object-cover" />
              </button>
            ))}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-dashed border-navy-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:border-ocean-600/60 hover:text-ocean-300"
            >
              Upload your Canva export…
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </div>
        </div>

        <button
          type="button"
          onClick={buildPoster}
          className="mt-2 rounded-full bg-ocean-500 px-6 py-3 font-semibold text-navy-950 transition-colors hover:bg-ocean-400"
        >
          🎨 Build poster
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-2xl border border-navy-800 bg-navy-900">
          {posterUrl ? (
            <img src={posterUrl} alt="Generated poster" className="w-full" />
          ) : (
            <div className="grid aspect-video place-items-center text-slate-500">
              Preview appears here after you click “Build poster”
            </div>
          )}
        </div>
        {posterUrl && (
          <div className="flex flex-wrap gap-3">
            <a
              href={posterUrl}
              download="poster.png"
              className="rounded-full bg-ocean-500 px-5 py-2.5 text-sm font-semibold text-navy-950 transition-colors hover:bg-ocean-400"
            >
              ⬇ Download poster.png
            </a>
            <button
              type="button"
              onClick={buildPoster}
              className="rounded-full border border-navy-700 px-5 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:border-ocean-600/60 hover:text-ocean-300"
            >
              Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
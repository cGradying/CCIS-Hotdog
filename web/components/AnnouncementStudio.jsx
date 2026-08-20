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

async function buildPosterCanvas({ title, description, meetingLink, background }) {
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

  return canvas.toDataURL('image/png');
}

function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  'rounded-xl border border-navy-700 bg-navy-950 px-4 py-2.5 text-sm text-slate-100 focus:border-ocean-500 focus:outline-none';

export default function AnnouncementStudio() {
  const [title, setTitle] = useState('First Year Orientation');
  const [description, setDescription] = useState(
    'Welcome to BSCS 1N! Meet your blockmates, get the syllabus, and learn how to submit and pull resources.'
  );
  const [meetingLink, setMeetingLink] = useState('https://meet.google.com/xyz');
  const [meetingDatetime, setMeetingDatetime] = useState('Aug 25, 2026 · 10:00 AM');
  const [background, setBackground] = useState(PRESETS[0]);
  const [sheetUrl, setSheetUrl] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [posterUrl, setPosterUrl] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [targets, setTargets] = useState({ email: true, facebook: true, discord: true });
  const fileRef = useRef(null);

  function toggleTarget(key) {
    setTargets((t) => ({ ...t, [key]: !t[key] }));
  }

  async function buildPoster() {
    setError(null);
    try {
      setPosterUrl(await buildPosterCanvas({ title, description, meetingLink, background }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function publish() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/announce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminKey ? { Authorization: `Bearer ${adminKey}` } : {}),
        },
        body: JSON.stringify({
          title,
          description,
          meetingLink,
          meetingDatetime,
          imageDataUrl: posterUrl || null,
          sheetUrl: sheetUrl || undefined,
          targets,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  const anyTarget = Object.values(targets).some(Boolean);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-4 rounded-2xl border border-navy-800 bg-navy-900 p-6">
        <h2 className="text-xl font-bold">1 · Announcement details</h2>

        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Description / content">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={`${inputClass} resize-y`}
          />
        </Field>

        <Field label="Meeting link (optional)">
          <input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Date / time">
          <input value={meetingDatetime} onChange={(e) => setMeetingDatetime(e.target.value)} className={inputClass} />
        </Field>

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
            <input ref={fileRef} type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && setBackground(URL.createObjectURL(e.target.files[0]))} className="hidden" />
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

        <div className="rounded-2xl border border-navy-800 bg-navy-900 p-6">
          <h2 className="text-xl font-bold">2 · Publish</h2>
          <p className="mt-1 text-sm text-slate-400">
            Pick where this announcement goes. Email opens your mail app with everyone on the class sheet BCC’d.
          </p>

          <Field label="Google Sheet URL (optional — defaults to server config)">
            <input
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              className={inputClass}
            />
          </Field>

          <Field label="Admin key (only if the server requires it)" hint="Set as the ADMIN_TOKEN secret on Cloudflare.">
            <input
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              type="password"
              placeholder="••••••••"
              className={inputClass}
            />
          </Field>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { key: 'email', label: '📧 Email (mailto)' },
              { key: 'facebook', label: '📘 Facebook' },
              { key: 'discord', label: '💬 Discord' },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleTarget(key)}
                aria-pressed={targets[key]}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  targets[key]
                    ? 'border-ocean-500 bg-ocean-500/15 text-ocean-300'
                    : 'border-navy-700 text-slate-400 hover:border-navy-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}

          {result && (
            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-ocean-500/30 bg-navy-950 p-4 text-sm">
              <p className="font-semibold text-ocean-300">✅ Done</p>
              {result.emails?.length ? (
                <p className="text-slate-300">👥 {result.emails.length} recipients loaded from the sheet</p>
              ) : null}
              {result.mailtoUri ? (
                <a href={result.mailtoUri} className="text-ocean-400 underline hover:text-ocean-300">
                  Open email draft (mailto)
                </a>
              ) : null}
              {result.facebook ? (
                <p className="text-slate-300">
                  📘 Facebook: {result.facebook.skipped ? result.facebook.reason : `posted (id ${result.facebook.postId})`}
                </p>
              ) : null}
              {result.discord ? (
                <p className="text-slate-300">
                  💬 Discord: {result.discord.skipped ? result.discord.reason : 'posted'}
                </p>
              ) : null}
              {result.errors?.length ? (
                <p className="text-amber-300">⚠️ {result.errors.map((e) => `${e.step}: ${e.message}`).join(' · ')}</p>
              ) : null}
            </div>
          )}

          <button
            type="button"
            onClick={publish}
            disabled={!anyTarget || sending}
            className="mt-4 w-full rounded-full bg-ocean-500 px-6 py-3 font-semibold text-navy-950 transition-colors hover:bg-ocean-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? 'Sending…' : anyTarget ? '🚀 Publish announcement' : 'Pick at least one destination'}
          </button>
        </div>
      </div>
    </div>
  );
}
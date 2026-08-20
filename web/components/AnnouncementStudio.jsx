'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  'w-full rounded-xl border border-navy-700 bg-navy-950 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-ocean-500 focus:outline-none';

function Section({ step, title, subtitle, children }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-navy-800 bg-navy-900/60 p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ocean-500/15 text-sm font-bold text-ocean-300">
          {step}
        </span>
        <div>
          <h2 className="text-lg font-bold leading-tight">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function Toggle({ active, onClick, emoji, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
        active
          ? 'border-ocean-500 bg-ocean-500/15 text-ocean-300 shadow-[0_0_20px_rgba(42,183,202,0.15)]'
          : 'border-navy-700 text-slate-400 hover:border-navy-600 hover:text-slate-300'
      }`}
    >
      <span>{emoji}</span>
      {label}
    </button>
  );
}

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
  const [recipientCount, setRecipientCount] = useState(null);
  const [recipientState, setRecipientState] = useState('idle'); // idle | loading | ready | error
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

  const refreshRecipients = useCallback(async () => {
    setRecipientState('loading');
    try {
      const params = new URLSearchParams();
      if (sheetUrl) params.set('sheetUrl', sheetUrl);
      const res = await fetch(`/api/emails?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRecipientCount(data.count);
      setRecipientState('ready');
    } catch (err) {
      setRecipientState('error');
      setRecipientCount(null);
      setError(err.message);
    }
  }, [sheetUrl]);

  useEffect(() => {
    refreshRecipients();
  }, [refreshRecipients]);

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
  const doneTargets = useMemo(() => {
    if (!result) return [];
    const list = [];
    if (result.emails?.length || result.mailtoUri) list.push({ emoji: '📧', label: 'Email' });
    if (result.facebook?.posted) list.push({ emoji: '📘', label: 'Facebook' });
    if (result.discord?.posted) list.push({ emoji: '💬', label: 'Discord' });
    return list;
  }, [result]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <Section step={1} title="Compose the announcement" subtitle="Title, content and meeting details go onto the poster too.">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Meeting link (optional)">
              <input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Date / time">
              <input value={meetingDatetime} onChange={(e) => setMeetingDatetime(e.target.value)} className={inputClass} />
            </Field>
          </div>

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
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && setBackground(URL.createObjectURL(e.target.files[0]))}
                className="hidden"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={buildPoster}
            className="mt-1 self-start rounded-full bg-ocean-500 px-6 py-3 font-semibold text-navy-950 transition-colors hover:bg-ocean-400"
          >
            🎨 Build poster
          </button>
        </Section>

        <Section step={2} title="Recipients" subtitle="Everyone pulled from every tab of the class sheet.">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                recipientState === 'ready'
                  ? 'border-ocean-500/40 bg-ocean-500/10 text-ocean-300'
                  : recipientState === 'loading'
                    ? 'border-navy-700 text-slate-400'
                    : 'border-red-500/40 bg-red-500/10 text-red-300'
              }`}
            >
              {recipientState === 'loading'
                ? '⏳ Loading…'
                : recipientState === 'error'
                  ? '⚠️ Could not load recipients'
                  : `👥 ${recipientCount} recipients`}
            </div>
            <button
              type="button"
              onClick={refreshRecipients}
              disabled={recipientState === 'loading'}
              className="rounded-full border border-navy-700 px-4 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-ocean-600/60 hover:text-ocean-300 disabled:opacity-40"
            >
              ↻ Refresh
            </button>
            <a
              href={`/api/emails?format=csv${sheetUrl ? `&sheetUrl=${encodeURIComponent(sheetUrl)}` : ''}`}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                recipientState === 'ready'
                  ? 'border-ocean-500 bg-ocean-500/15 text-ocean-300 hover:bg-ocean-500/25'
                  : 'pointer-events-none border-navy-700 text-slate-600'
              }`}
            >
              ⬇ Download CSV ({recipientCount ?? '–'})
            </a>
          </div>
          <p className="text-xs text-slate-500">
            The CSV lists every unique email across all sections (BSIT 1-1 through BSCS 1-5). Use it to import into
            your mail app or Google Contacts.
          </p>
        </Section>
      </div>

      <div className="flex flex-col gap-6">
        <Section step={3} title="Poster preview" subtitle="What the email attachment, Facebook post and Discord embed will look like.">
          <div className="overflow-hidden rounded-2xl border border-navy-800 bg-navy-950">
            {posterUrl ? (
              <img src={posterUrl} alt="Generated poster" className="w-full" />
            ) : (
              <div className="grid aspect-video place-items-center text-sm text-slate-500">
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
        </Section>

        <Section step={4} title="Publish" subtitle="Email opens your mail app with everyone BCC’d; Facebook and Discord post directly.">
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Toggle active={targets.email} onClick={() => toggleTarget('email')} emoji="📧" label="Email" />
            <Toggle active={targets.facebook} onClick={() => toggleTarget('facebook')} emoji="📘" label="Facebook" />
            <Toggle active={targets.discord} onClick={() => toggleTarget('discord')} emoji="💬" label="Discord" />
          </div>

          {error && (
            <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
          )}

          {result && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-ocean-500/30 bg-navy-950 p-4 text-sm">
              <p className="font-semibold text-ocean-300">✅ Announcement complete</p>
              {doneTargets.length ? (
                <div className="flex flex-wrap gap-2">
                  {doneTargets.map((t) => (
                    <span key={t.label} className="rounded-full bg-ocean-500/10 px-3 py-1 text-xs font-semibold text-ocean-300">
                      {t.emoji} {t.label}
                    </span>
                  ))}
                </div>
              ) : null}
              {result.emails?.length ? (
                <p className="text-slate-300">👥 {result.emails.length} recipients BCC’d in the email draft</p>
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
            className="mt-1 w-full rounded-full bg-ocean-500 px-6 py-3 font-semibold text-navy-950 transition-colors hover:bg-ocean-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? 'Sending…' : anyTarget ? '🚀 Publish announcement' : 'Pick at least one destination'}
          </button>
        </Section>
      </div>
    </div>
  );
}
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'Resource Vault — BSCS 1N',
  description:
    'Per-subject resource library for BSCS 1N — midterm reviewers, practice sets, handouts and more, moderated by your class Discord server.',
};

const INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-40 border-b border-navy-800 bg-navy-950/80 backdrop-blur">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="group flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-ocean-500/15 text-lg">
                🌊
              </span>
              <span className="text-lg font-bold tracking-tight">
                Resource<span className="text-ocean-400">Vault</span>
              </span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/#subjects" className="text-slate-300 transition-colors hover:text-ocean-300">
                Subjects
              </Link>
              <Link href="/studio" className="text-slate-300 transition-colors hover:text-ocean-300">
                Announce
              </Link>
              <Link
                href={INVITE_URL || '#'}
                className="rounded-full bg-ocean-500 px-4 py-1.5 font-semibold text-navy-950 transition-colors hover:bg-ocean-400"
              >
                Join Discord
              </Link>
            </div>
          </nav>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-navy-800 bg-navy-950">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-8 text-center text-sm text-slate-400 sm:px-6">
            <p className="flex items-center gap-1.5">
              <span>🌊</span>
              <span>
                Resource Vault · a per-subject resource library for BSCS 1N
              </span>
            </p>
            <p>
              Powered by the{' '}
              <a
                href="https://discord.com"
                target="_blank"
                rel="noreferrer"
                className="text-ocean-400 hover:text-ocean-300"
              >
                class Discord server
              </a>
              {' · '}
              <Link href="/studio" className="text-ocean-400 hover:text-ocean-300">
                Announcement Studio
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
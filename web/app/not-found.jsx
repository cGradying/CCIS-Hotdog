import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-28 text-center sm:px-6">
      <p className="text-6xl">🌊</p>
      <h1 className="text-2xl font-bold tracking-tight">That page drifted away</h1>
      <p className="text-slate-400">This subject doesn&apos;t exist or has no approved resources yet.</p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-ocean-500 px-6 py-3 font-semibold text-navy-950 transition-colors hover:bg-ocean-400"
      >
        Back to the vault
      </Link>
    </main>
  );
}
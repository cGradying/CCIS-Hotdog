import AnnouncementStudio from '../../components/AnnouncementStudio';

export const metadata = {
  title: 'Announcement Studio — Resource Vault',
};

export default function StudioPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Announcement Studio</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Compose the announcement, build the poster in your browser, then publish it end-to-end:
          email everyone on the class sheet (mailto), post to the Facebook page, and send the
          Discord announcement — all from one place.
        </p>
      </div>
      <AnnouncementStudio />
    </main>
  );
}
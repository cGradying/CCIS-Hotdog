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
          Type in the title, content and meeting details, pick a background, and build the poster
          right in your browser. Download the PNG to post on Facebook / Discord, or export your
          Canva design and upload it as the background.
        </p>
      </div>
      <AnnouncementStudio />
    </main>
  );
}
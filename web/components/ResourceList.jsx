import Link from 'next/link';

function formatDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function ResourceCard({ resource }) {
  const date = formatDate(resource.createdAt);
  return (
    <article className="group flex flex-col rounded-2xl border border-navy-800 bg-navy-900 p-5 transition-colors hover:border-ocean-600/60">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Link
          href={`/subjects/${encodeURIComponent(resource.subject)}`}
          className="rounded-full bg-ocean-500/15 px-3 py-1 text-xs font-semibold text-ocean-300 transition-colors hover:bg-ocean-500/25"
        >
          {resource.subject}
        </Link>
        {date && <span className="text-xs text-slate-500">{date}</span>}
      </div>

      <h3 className="text-base font-semibold leading-snug text-slate-100">{resource.title}</h3>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {resource.link && (
          <a
            href={resource.link}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-ocean-500/50 px-3.5 py-1.5 font-medium text-ocean-300 transition-colors hover:bg-ocean-500/10"
          >
            Open link ↗
          </a>
        )}
        {resource.hasFile && resource.fileLink && (
          <a
            href={resource.fileLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-navy-700 px-3.5 py-1.5 font-medium text-slate-300 transition-colors hover:border-ocean-600/60 hover:text-ocean-300"
          >
            📎 View file
          </a>
        )}
      </div>
    </article>
  );
}

export default function ResourceList({ resources, emptyMessage = 'No approved resources here yet.' }) {
  if (!resources.length) {
    return (
      <div className="rounded-2xl border border-dashed border-navy-700 p-10 text-center text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {resources.map((resource) => (
        <ResourceCard key={resource.id} resource={resource} />
      ))}
    </div>
  );
}
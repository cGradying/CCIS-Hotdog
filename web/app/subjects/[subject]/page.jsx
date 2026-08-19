import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getApprovedBySubject, getKnownSubjects } from '../../../../src/store.js';
import { enrichResource } from '../../../lib/format';
import ResourceList from '../../../components/ResourceList';

export const dynamic = 'force-dynamic';

function normalize(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export default async function SubjectPage({ params }) {
  const { subject } = await params;

  const subjects = await getKnownSubjects();
  const display = subjects.find((s) => normalize(s) === normalize(subject));
  if (!display) notFound();

  const rows = await getApprovedBySubject(display);
  const resources = rows.map(enrichResource);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/#subjects" className="text-sm text-slate-400 transition-colors hover:text-ocean-300">
        ← All subjects
      </Link>

      <div className="mb-8 mt-4">
        <h1 className="text-3xl font-bold tracking-tight">{display}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {resources.length} approved resource{resources.length === 1 ? '' : 's'} for this subject.
        </p>
      </div>

      <ResourceList
        resources={resources}
        emptyMessage={`No approved resources for ${display} yet — add one in Discord with /resource-add.`}
      />
    </main>
  );
}
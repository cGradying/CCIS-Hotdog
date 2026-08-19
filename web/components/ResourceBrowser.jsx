'use client';

import { useMemo, useState } from 'react';
import ResourceList from './ResourceList';
import { groupBySubject } from '../lib/format';

export default function ResourceBrowser({ resources }) {
  const [query, setQuery] = useState('');
  const [activeSubject, setActiveSubject] = useState('all');

  const subjects = useMemo(() => groupBySubject(resources), [resources]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((resource) => {
      if (activeSubject !== 'all' && resource.subjectKey !== activeSubject) return false;
      if (!q) return true;
      return (
        resource.title.toLowerCase().includes(q) ||
        resource.subject.toLowerCase().includes(q) ||
        (resource.link || '').toLowerCase().includes(q)
      );
    });
  }, [resources, query, activeSubject]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight" id="subjects">
              Resource library
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              {resources.length} approved resource{resources.length === 1 ? '' : 's'} across{' '}
              {subjects.length} subject{subjects.length === 1 ? '' : 's'}.
            </p>
          </div>

          <label className="relative block w-full sm:w-72">
            <span className="sr-only">Search resources</span>
            <svg
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, subjects, links…"
              className="w-full rounded-full border border-navy-700 bg-navy-900 py-2.5 pl-9 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-ocean-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveSubject('all')}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              activeSubject === 'all'
                ? 'bg-ocean-500 text-navy-950'
                : 'border border-navy-700 text-slate-300 hover:border-ocean-600/60 hover:text-ocean-300'
            }`}
          >
            All
          </button>
          {subjects.map((subject) => (
            <button
              key={subject.key}
              onClick={() => setActiveSubject(subject.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                activeSubject === subject.key
                  ? 'bg-ocean-500 text-navy-950'
                  : 'border border-navy-700 text-slate-300 hover:border-ocean-600/60 hover:text-ocean-300'
              }`}
            >
              {subject.display}
              <span className="ml-1.5 text-xs opacity-70">{subject.count}</span>
            </button>
          ))}
        </div>

        <ResourceList
          resources={filtered}
          emptyMessage={
            query
              ? `No resources match "${query}".`
              : 'Nothing here yet — add one in Discord with /resource-add!'
          }
        />
      </div>
    </div>
  );
}
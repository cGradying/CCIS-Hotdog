import { getAllApproved } from '../lib/resources';
import ResourceBrowser from '../components/ResourceBrowser';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const resources = await getAllApproved();

  return (
    <main>
      <section className="relative overflow-hidden border-b border-navy-800">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(60rem 30rem at 80% -10%, rgba(42,183,202,0.18), transparent 60%), radial-gradient(40rem 22rem at 10% 110%, rgba(42,183,202,0.1), transparent 60%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-ocean-500/40 bg-ocean-500/10 px-4 py-1.5 text-sm font-medium text-ocean-300">
            <span className="size-1.5 rounded-full bg-ocean-400" />
            BSCS 1N · Class resource vault
          </p>
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Every reviewer, handout and practice set,{' '}
            <span className="text-ocean-400">in one place</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-400">
            Browse approved study resources for each subject — added by classmates,
            reviewed by your moderators, right from your class Discord server.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#subjects"
              className="rounded-full bg-ocean-500 px-6 py-3 font-semibold text-navy-950 transition-colors hover:bg-ocean-400"
            >
              Browse resources
            </a>
            <a
              href="#how-it-works"
              className="rounded-full border border-navy-700 px-6 py-3 font-semibold text-slate-300 transition-colors hover:border-ocean-600/60 hover:text-ocean-300"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      <ResourceBrowser resources={resources} />

      <section id="how-it-works" className="border-t border-navy-800 bg-navy-900/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 md:grid-cols-3">
          {[
            {
              icon: '➕',
              title: 'Submit',
              text: 'Found a useful reviewer or handout? Run /resource-add in Discord — it goes to the review queue.',
            },
            {
              icon: '✅',
              title: 'Moderated',
              text: 'Mods approve or reject submissions with a click. Only approved resources ever show up here.',
            },
            {
              icon: '🌊',
              title: 'Browse',
              text: 'Search this site or pull them anytime in Discord with /resources to grab links and files.',
            },
          ].map((step) => (
            <div key={step.title} className="rounded-2xl border border-navy-800 bg-navy-900 p-6">
              <div className="mb-3 grid size-11 place-items-center rounded-xl bg-ocean-500/15 text-xl">
                {step.icon}
              </div>
              <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{step.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
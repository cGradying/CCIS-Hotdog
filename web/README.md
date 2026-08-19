# Resource Vault — website

A read-only public web view of the Discord bot's resource library. Same data,
same normalization, same store backend — it imports the bot's `store.js`
directly so `COMP 001`, `comp001` and `  Geed    004 ` all resolve identically
here and in Discord.

Plain-JS Next.js App Router, Tailwind CSS v4, no TypeScript (matches the bot's
plain-ESM style). Node >= 18.

## Structure

```
web/
  app/                  App Router: layout, home, /subjects/[subject], 404
  components/           ResourceBrowser (client), ResourceList (presentational)
  lib/resources.js      store-backed fetchers (server-only)
  lib/format.js         pure helpers — safe to import from client components
```

**Important:** client components must only import from `lib/format.js`. The
server-side fetchers in `lib/resources.js` pull in the bot's `store.js`, which
uses Node-only modules (`fs`, `mongodb`, `dotenv`).

## Run locally

```bash
# from the repo root AND from web/ — the site resolves the bot's deps at the root
npm install
cd web && npm install

npm run dev        # web/, → http://localhost:3000
npm run build      # web/, production build (also catches bundling errors)
```

## Data backend

The site shows whatever backend is configured, same priority as the bot:

1. GitHub-as-database — `GITHUB_TOKEN` + `GITHUB_DATA_REPO`
2. MongoDB — `MONGODB_URI`
3. Local file — `data/resources.json` (won't persist on serverless, so only
   useful for local dev with a committed/real file)

Copy `web/.env.example` to `web/.env` locally. The site is read-only — it never
writes to the store, so it's safe to point at the bot's real data.

## Deploy

### Vercel (recommended)

1. Push the repo to GitHub and import it into Vercel.
2. In **Project settings → General → Root Directory**, set it to `web`.
   Framework preset auto-detects Next.js.
3. Add the backend env vars (`GITHUB_TOKEN`, `GITHUB_DATA_REPO`, `GITHUB_BRANCH`,
   `GITHUB_DATA_PATH` — or `MONGODB_URI`) and optionally
   `NEXT_PUBLIC_DISCORD_INVITE`.
4. Deploy. `/` is server-rendered on demand (`export const dynamic =
   'force-dynamic'`), so it always shows live data — no cache staleness.

### Cloudflare Pages (via OpenNext)

```bash
cd web
npx @opennextjs/cloudflare@latest init   # adds wrangler + OpenNext config
npm run deploy                            # builds with the Cloudflare adapter
```

Set the same env vars in Cloudflare Pages → Settings → Environment variables.
The GitHub backend is recommended here (HTTP fetch only); the MongoDB driver
works too but needs the TCP connection allowed for the Worker.

## Why not static export?

The site reads a live store on every request (`force-dynamic`). A fully static
export would bake in a stale snapshot and needs the store readable at build
time on a server. If you ever want that, pre-generate `data/resources.json`
and run `next export`.
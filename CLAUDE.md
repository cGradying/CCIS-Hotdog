# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Discord bot: per-subject resource library with a moderated submission queue,
plus an announcement pipeline (Google Sheet → BCC email, poster, Facebook post,
Discord announcement) and a read-only Next.js website in `web/`. Entirely
slash-command driven. Node >= 18, ESM (`"type": "module"`).

## Commands

```bash
npm install
npm start              # node src/index.js
npm run announce       # run the announcement pipeline (email + facebook + poster)
npm run announce:dry   # fetch emails + build poster, send nothing
npm run self-check     # plain-node sanity checks
cd web && npm run dev  # website
```

No test suite, no lint config. Slash commands re-register globally on every
`ready` event via `REST.put(Routes.applicationCommands(...))`, so command
changes take effect on restart — no separate deploy/register script.

Expect `[bot] logged in as…` and `[web] health listener up on…` on a healthy boot.

## Architecture

```
src/index.js   bare /health HTTP listener + boots the client
src/bot.js     one interactionCreate handler: commands, autocomplete, buttons
src/config.js  env → config object
src/store.js   persistence, backend chosen at runtime
src/announcement.js  announcement content template (email/Facebook/Discord/poster)
src/sheets.js      Google Sheets → email list
src/poster.js      banner + title/content overlay → poster PNG (sharp)
src/mail.js        Gmail SMTP sender + mailto receipt writer
src/facebook.js    Graph API Page post
src/pipeline.js    orchestrates the announcement flow
scripts/run-pipeline.js  one-shot CLI for the pipeline
web/               read-only Next.js view of the same store (see web/README.md)
```

Command handling is deliberately single-file: slash commands, autocomplete
responses, and approve/reject button routing all live in one
`interactionCreate` handler in `bot.js`. `index.js` exists only to keep a port
open for hosts that idle a portless process out.

### Storage backends

`store.js` picks a backend at runtime, first match wins:

1. **GitHub as a database** — `GITHUB_TOKEN` + `GITHUB_DATA_REPO` set. Commits
   the JSON file through the contents API, re-fetching the blob SHA immediately
   before each write. Point this at a repo that does **not** deploy this bot —
   otherwise every submission triggers a redeploy loop.
2. **MongoDB** — `MONGODB_URI` set (database name `resource_faq_bot`).
3. **Local file** — `data/resources.json`.

Every mutation reads the whole store, mutates in memory, writes it back whole.
There is no partial-update path — keep new mutations in that shape.

### Data model

`{ resources: [...], subjectChannels: { "<subjectKey>": "<channelId>" } }`.
`normalizeStoreShape` upgrades the older bare-array format on read.

**Subject codes are normalized twice** — don't collapse this into one step:
- `normalizeSubject` strips whitespace + uppercases → `subjectKey`, the lookup key.
- `displaySubject` produces the canonical `"COMP 001"` shown to users.

Always match on `subjectKey`, never the display string, so `COMP 001`,
`comp001`, and `  Geed    004 ` resolve to the same entry.

**Resources carry two message refs**: `reviewRef` (submission message +
attachment in the review channel) and `postedRef` (the permanent post after
approval). Attachments are never re-hosted — a fresh attachment URL is pulled
from the review message at approval time (raw CDN URLs expire), and users get
a message link instead.

Button custom IDs: `res_review:<approve|reject>:<resourceId>`. Permission
checks route through `isModerator()`: `MOD_ROLE_ID` if configured, else the
`ManageGuild` permission.

### Announcement pipeline

`runAnnouncementPipeline()` in `pipeline.js` runs independent, best-effort
steps and returns a summary with `errors[]` — one failing step (e.g. Facebook
not configured) never blocks the rest. Never let a step throw out of the
orchestrator. Triggered via the `/announce` slash command (mods) or
`scripts/run-pipeline.js`.

Content is composed once in `announcement.js` from env vars; every output
(email body, Facebook caption, Discord embed, poster) derives from that same
object. Posters are composited in `poster.js` with `sharp` (SVG text overlay —
escape all XML). Emails go out as **one message with everyone BCC'd** via
`mail.js`; each real run writes a receipt (audit JSON + recipients CSV +
mailto link) into `OUTPUT_DIR` (default `output/`, gitignored).

**Important for the website**: `web/lib/resources.js` imports the bot's
`store.js` directly — it must stay plain ESM with no new Node-only import
that would break the serverless bundle. Client components may only import from
`web/lib/format.js` (pure helpers), never from store-backed modules.

## Configuration

`cp .env.example .env`. Required: `DISCORD_TOKEN`, `REVIEW_CHANNEL_ID`. See
README for the full variable table (GitHub/Mongo backend selection, mod role,
pipeline, Facebook, etc). `config.js` reads all env vars into one object;
`assertConfig()` warns on missing values rather than exiting.

Log prefixes: `[bot]`, `[web]`, `[config]`, `[pipeline]`.

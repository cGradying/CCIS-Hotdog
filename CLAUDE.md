# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Discord bot: per-subject resource library with a moderated submission queue.
Entirely slash-command driven, no web UI. Node >= 18, ESM (`"type": "module"`).

## Commands

```bash
npm install
npm start          # node src/index.js
```

No test suite, no build step, no lint config. Slash commands re-register
globally on every `ready` event via `REST.put(Routes.applicationCommands(...))`,
so command changes take effect on restart — no separate deploy/register script.

Expect `[bot] logged in as…` and `[web] health listener up on…` on a healthy boot.

## Architecture

```
src/index.js   bare /health HTTP listener + boots the client
src/bot.js     one interactionCreate handler: commands, autocomplete, buttons
src/config.js  env → config object
src/store.js   persistence, backend chosen at runtime
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

## Configuration

`cp .env.example .env`. Required: `DISCORD_TOKEN`, `REVIEW_CHANNEL_ID`. See
README for the full variable table (GitHub/Mongo backend selection, mod role,
etc). `config.js` reads all env vars into one object; `assertConfig()` warns
on missing values rather than exiting.

Log prefixes: `[bot]`, `[web]`, `[config]`.

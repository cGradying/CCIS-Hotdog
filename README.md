# Resource/FAQ Bot

A Discord bot that keeps a **per-subject resource library** for your class:
anyone submits a resource, moderators approve it, everyone can pull it back out.
Plus an **announcement pipeline** that turns one template into an email to the
whole class, a Facebook post, a Discord announcement and a shareable poster.

Entirely slash-command driven — no web UI, no admin panel. Node >= 18, ESM.

## Quick start

```bash
npm install
cp .env.example .env        # fill in DISCORD_TOKEN + REVIEW_CHANNEL_ID
npm start                   # node src/index.js
```

Expect `[bot] logged in as…` and `[web] health listener up on…` on a healthy boot.

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Storage backends](#storage-backends)
- [Data model](#data-model)
- [Slash commands](#slash-commands)
- [Announcement pipeline](#announcement-pipeline)
- [Website](#website)
- [Configuration](#configuration)
- [Discord application setup](#discord-application-setup)
- [Scripts](#scripts)

## Features

- 📥 **Moderated submissions** — `/resource-add` drops a resource into a review
  queue with one-click Approve / Reject buttons.
- 📚 **Instant lookups** — `/resources` lists approved resources per subject,
  with subject + title autocomplete.
- 📢 **Auto-posting** — approved resources re-post into a subject's channel or
  thread automatically.
- 📣 **Announcement pipeline** — one run emails the whole class (BCC), posts to
  Facebook, announces in Discord, and generates a branded poster + receipt.
- 🌐 **Public website** — a read-only Next.js view of the same data, deployable
  to Vercel or Cloudflare.

## Architecture

```
src/index.js       bare /health HTTP listener + boots the client
src/bot.js         one interactionCreate handler: commands, autocomplete, buttons
src/config.js      env → config object
src/store.js       persistence, backend chosen at runtime
src/announcement.js  announcement content template (email/Facebook/Discord/poster)
src/sheets.js      Google Sheets → email list
src/poster.js      banner image + title/content overlay → poster PNG (sharp)
src/mail.js        Gmail SMTP sender + mailto receipt writer
src/facebook.js    Graph API Page post
src/pipeline.js    orchestrates the announcement flow
scripts/run-pipeline.js  one-shot CLI for the pipeline (no Discord needed)
scripts/self-check.js    plain-node sanity checks
```

Command handling is deliberately single-file: slash commands, autocomplete
responses and approve/reject button routing all live in one `interactionCreate`
handler in `bot.js`. `index.js` exists only to keep a port open for hosts that
would otherwise idle the process out.

Slash commands re-register globally on every `ready` event, so command changes
take effect on restart — no separate deploy script.

## Storage backends

`store.js` picks a backend at runtime, first match wins:

1. **GitHub as a database** — `GITHUB_TOKEN` + `GITHUB_DATA_REPO` set. Commits
   the JSON file through the contents API, re-fetching the blob SHA immediately
   before each write. Point this at a repo that does **not** deploy this bot —
   otherwise every submission triggers a redeploy loop. Also yields a full audit
   history via `git log`.
2. **MongoDB** — `MONGODB_URI` set (database name `resource_faq_bot`).
3. **Local file** — `data/resources.json` (fine on a host with a real disk).

Every mutation reads the whole store, mutates in memory, and writes it back
whole. There is no partial-update path — keep new mutations in that shape.

## Data model

```jsonc
{
  "resources": [ /* … */ ],
  "subjectChannels": { "<subjectKey>": "<channelId>" }
}
```

`normalizeStoreShape` upgrades the older bare-array format on read.

**Subject codes are normalized twice** — don't collapse this into one step:

- `normalizeSubject` strips whitespace + uppercases → `subjectKey`, the lookup key.
- `displaySubject` produces the canonical `"COMP 001"` shown to users.

Always match on `subjectKey`, never the display string, so `COMP 001`,
`comp001`, and `  Geed    004 ` resolve to the same entry.

**Resources carry two message refs:**

| Ref | Points at |
|---|---|
| `reviewRef` | The submission message in the review channel, and its attachment |
| `postedRef` | The permanent post after approval |

Attachments are never re-hosted — a fresh attachment URL is pulled from the
review message at approval time (raw CDN URLs expire), and users get a message
link instead.

Button custom IDs are `res_review:<approve|reject>:<resourceId>`. The
`resource-remove` autocomplete returns the resource **id** as its value so
similarly-titled entries stay unambiguous. Permission checks route through
`isModerator()`: `MOD_ROLE_ID` if configured, else the `ManageGuild` permission.

## Slash commands

| Command | Access | Behavior |
|---|---|---|
| `/resource-add subject title [link] [file]` | anyone | Submit a resource (link, file, or both). Posts to the review queue with Approve / Reject buttons |
| `/resources subject [search]` | anyone | List approved resources. `subject` autocompletes from approved entries; `search` narrows by title, scoped to the chosen subject |
| `/resource-remove subject title` | mods | Remove a resource. Autocomplete lists pending, approved and rejected, labeled |
| `/resource-pending` | mods | List submissions awaiting review |
| `/subject-channel-set subject channel` | mods | Map a subject to a channel **or thread** for auto-posting on approval |
| `/subject-channel-list` | mods | Dump all current mappings |
| `/announce [dry-run]` | mods | Run the announcement pipeline end to end |

Subject autocomplete is derived from approved resources at query time — there
is no subject list to maintain. Mappings can be set before any resource exists
and re-pointed at any time (e.g. after archiving a forum thread) with no redeploy.

## Announcement pipeline

One command broadcasts an announcement everywhere at once. The content is
generated from a single template (env vars), so the email, Facebook caption,
Discord embed and poster all say the same thing.

### Flow

```
config template ─┬─► poster generator ──► assets/poster.png ──► Facebook post
                 │                                              + email attachment
                 ├─► Google Sheet ──► email list ──► one BCC email via Gmail SMTP
                 │
                 └─► /announce ──► Discord announcement channel
```

Every step is independent — a failure in one is logged and the rest still run.

### Run it

```bash
npm run announce          # full pipeline: email + Facebook + poster
npm run announce:dry      # fetch emails + build poster, send/post nothing
node scripts/run-pipeline.js --skip-email --skip-facebook
```

Or in Discord: `/announce` (mods) — the bot runs the same pipeline, posts the
announcement + poster to `ANNOUNCEMENT_CHANNEL_ID`, and replies with a summary.
`/announce dry-run:true` sends nothing.

### What you get back

A **receipt** is written to `output/` after each real run:

- `receipt-<timestamp>.json` — full audit: recipients, subject, email + Facebook results
- `receipt-<timestamp>-recipients.csv` — every email, one per line
- `receipt-<timestamp>-mailto.txt` — a `mailto:` link with everyone BCC'd, in
  case you want to send it manually from your own mail client

### Notes

- Emails are sent **one per run** with every recipient in BCC, so nobody sees
  the class list. Needs a [Gmail App Password](https://support.google.com/accounts/answer/185833)
  — not your account password. Gmail caps ~500 recipients/day for app passwords.
- The **banner** is whatever you export from Canva, saved to `assets/` and
  pointed at by `BANNER_PATH`. The poster generator overlays the announcement
  title + description (and a meeting button) onto it. If the file is missing it
  falls back to `assets/ocean-banner.png`, then a plain navy canvas.
- Facebook posting needs a **long-lived Page access token** (from the Graph
  API Explorer, with `pages_manage_posts` + `pages_read_engagement`). Leave the
  vars blank and the step is skipped gracefully.

## Website

`web/` holds a read-only Next.js (App Router, plain JS + Tailwind v4) public
view of the resource library. It imports the bot's own `store.js`, so it shows
the same approved resources with the same normalization. Server-rendered on
demand — no stale cache. See [`web/README.md`](web/README.md) for local dev and
Vercel/Cloudflare deploy steps (Vercel root directory: `web`).

## Configuration

`cp .env.example .env`

| Variable | Required | Notes |
|---|---|---|
| `DISCORD_TOKEN` | yes | Bot token |
| `REVIEW_CHANNEL_ID` | yes | Where submissions land for approval |
| `MOD_ROLE_ID` | no | Blank → anyone with Manage Server |
| `GITHUB_TOKEN` | no | Classic token, `repo` scope. Enables GitHub backend |
| `GITHUB_DATA_REPO` | no | `owner/repo`. Use a **separate** repo from the code |
| `GITHUB_DATA_BRANCH` | no | Default `main` |
| `GITHUB_DATA_PATH` | no | Default `resources.json`; created on first write |
| `MONGODB_URI` | no | Used only when `GITHUB_TOKEN` is blank |
| `GOOGLE_SHEET_URL` | no | Public sheet URL with an email column (pipeline) |
| `SHEET_EMAIL_COLUMN` | no | Default `Email` |
| `GMAIL_USER` | no | Sender address (pipeline) |
| `GMAIL_APP_PASSWORD` | no | App password, not the account password |
| `ANNOUNCEMENT_CHANNEL_ID` | no | Discord channel for `/announce` |
| `ANNOUNCEMENT_TITLE` | no | Default `Class Announcement` |
| `ANNOUNCEMENT_DESCRIPTION` | no | Body text used everywhere |
| `MEETING_LINK` | no | Rendered as the CTA link/button |
| `MEETING_DATETIME` | no | Plain-text "when" line |
| `EMAIL_SUBJECT` | no | Defaults to `ANNOUNCEMENT_TITLE` |
| `EMAIL_FROM_NAME` | no | Default `Resource Vault` |
| `BANNER_PATH` | no | Poster background image (export from Canva) |
| `POSTER_OUTPUT_PATH` | no | Default `assets/poster.png` |
| `OUTPUT_DIR` | no | Receipts land here, default `output/` |
| `FACEBOOK_PAGE_ID` | no | Facebook Page ID |
| `FACEBOOK_PAGE_ACCESS_TOKEN` | no | Long-lived Page token |

`config.js` reads all env vars into one exported object. `assertConfig()` warns
on missing values rather than exiting.

## Discord application setup

1. [Discord Developer Portal](https://discord.com/developers/applications) →
   **New Application**. This must be its own application, not one shared with
   another bot.
2. **Bot** → **Reset Token** → copy into `DISCORD_TOKEN`.
3. **OAuth2 → URL Generator** → scopes `bot`, `applications.commands`;
   permissions `Send Messages`, `Embed Links`, `Use Slash Commands`.
4. Enable Developer Mode in Discord, then copy the review channel's ID →
   `REVIEW_CHANNEL_ID`.
5. Optional: copy the moderator role ID → `MOD_ROLE_ID`. Blank falls back to
   `ManageGuild`.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the bot |
| `npm run announce` | Run the announcement pipeline end to end |
| `npm run announce:dry` | Fetch emails + build poster, send nothing |
| `npm run self-check` | Plain-node sanity checks (no test framework) |

Log prefixes: `[bot]`, `[web]`, `[config]`, `[pipeline]`.

---

<div align="center">

[![Author: cGradying](https://img.shields.io/badge/cGradying-AUTHOR-10B981?style=for-the-badge&labelColor=0B1120)](https://github.com/cGradying)

</div>
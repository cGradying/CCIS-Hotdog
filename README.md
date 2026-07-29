# Resource/FAQ Bot

A separate Discord bot (own app, own token, own repo/host — fully
independent from any other bot you're running) that lets a section build
up a shared library of resources per subject, entirely inside Discord —
no website, no login, no admin panel to host.

- `/resource-add subject title` — **anyone** can submit a resource, with
  a **link, an attached file, or both** (at least one required). Files
  aren't downloaded or re-hosted anywhere — the bot just remembers a
  Discord message link pointing straight at it, so it never goes stale
  the way raw Discord CDN file URLs eventually do.
- `/resource-remove` (mods only) — autocomplete lists every resource for
  a subject (pending, approved, or rejected — labeled so you can tell
  which), picks it by ID under the hood so there's no ambiguity between
  similarly-named entries. Also cleans up the associated Discord message
  (the approved post, or the review message if it was never approved) on
  a best-effort basis.
- Every submission gets posted to a review channel with **✅ Approve /
  ❌ Reject** buttons.
- Only people with the configured mod role (or "Manage Server" permission
  if you don't set one) can click those buttons.
- Once approved, `/resources <subject>` shows it to everyone — with
  autocomplete on subject codes, built automatically from whatever's
  already been approved (no need to hand-maintain a subject list).
- Optional second field, `/resources <subject> search:<text>` — narrows
  results by title instead of listing everything, with its own
  autocomplete scoped to whatever subject you already picked (typing
  "wa" suggests "Wake protocol notes" but not "Woke movement essay").
- `/resource-pending` (mods only) lists what's waiting on review, in case
  the review channel history gets buried.
- Once approved, the resource **also auto-posts** into that subject's own
  channel or thread — if you've mapped one. Mods set/change the mapping
  anytime with `/subject-channel-set subject:"COMP 001" channel:#comp-001`
  (works for regular channels *and* threads — e.g. forum posts). Add a new
  thread later and just re-run the command to point at it, no redeploy.
  `/subject-channel-list` shows all current mappings. Posts use a
  Minecraft-ocean-biome-styled embed (blocky blue/teal banner) to stand
  apart from regular chat.

Subject codes are normalized under the hood — `COMP 001`, `comp001`, and
`  Geed    004 ` all resolve to the same entry (`COMP 001` / `GEED 004`),
so people don't fragment the index by typing it slightly differently.

## Use cases

- Section-wide subject resource library (reviewers, PDFs, past exams) without
  scattering links across a dozen chat threads.
- Lightweight FAQ/knowledge base per subject, moderated so submissions stay
  on-topic and spam-free.
- Replacement for a shared Drive folder when you also want approval, search,
  and auto-posting into the right subject channel.

## 1. Create the bot (separate application from any other bot)

Same steps as any Discord bot:
1. discord.com/developers/applications → **New Application**
2. **Bot** tab → Reset Token → copy it → this is `DISCORD_TOKEN`
3. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`;
   permissions `Send Messages`, `Embed Links`, `Use Slash Commands`
4. Invite it to your server with the generated URL

## 2. Set up the review channel + mod role

1. Create (or pick) a channel for submissions to land in for review —
   copy its ID (Developer Mode on, right-click → Copy Channel ID) →
   `REVIEW_CHANNEL_ID`
2. Optional: pick a role that's allowed to approve/reject — copy its ID →
   `MOD_ROLE_ID`. If you skip this, anyone with "Manage Server" can
   approve instead.

## 3. Configure

```
cp .env.example .env
```
Fill in `DISCORD_TOKEN`, `REVIEW_CHANNEL_ID`, `MOD_ROLE_ID`.

## 4. Run locally first

```
npm install
npm start
```
Try `/resource-add` in your server, then approve it from the review
channel, then confirm `/resources <subject>` shows it.

## 5. Point subjects at their channels/threads (optional but recommended)

If your subjects live as threads under a forum channel (or as separate
text channels), map each one so approvals auto-post there instead of only
being pullable via `/resources`:

```
/subject-channel-set subject:"COMP 001" channel:#comp-001-thread
```

You can set this up before any resources exist for a subject, and change
it anytime — e.g. archived a thread and made a new one? Just re-run the
command pointing at the new one. `/subject-channel-list` shows everything
currently mapped.

## 6. Persistent storage

Same situation as any bot on a free host with no disk (Render free tier,
etc.) — data resets on every restart/redeploy unless you point it at
somewhere external. Two options, pick one:

### Option A — GitHub as the database (recommended if you're already on GitHub)

The bot can read/write a JSON file in a repo via the GitHub API — no
separate database service needed.

1. **Create a small, separate repo** just for this data — e.g.
   `resource-bot-data` — **not** the bot's own code repo. This matters:
   if it were the same repo Render deploys from, every resource
   submission would push a commit and could trigger a full redeploy.
2. github.com/settings/tokens → **Generate new token (classic)** → check
   the `repo` scope → generate → copy it.
3. Set in `.env`:
   ```
   GITHUB_TOKEN=<the token>
   GITHUB_DATA_REPO=yourname/resource-bot-data
   GITHUB_DATA_BRANCH=main
   GITHUB_DATA_PATH=resources.json
   ```
   The file doesn't need to exist beforehand — the bot creates it on the
   first submission.
4. Bonus: since it's just commits to a repo, you get a full history of
   every change for free — `git log` on that repo shows every add/approve/
   reject over time.

### Option B — MongoDB Atlas free tier

Same free Atlas setup as the schedule bot (see that project's README) —
you can reuse the same cluster, this bot just stores its data under its
own database name inside it, so there's no collision. Only used if
`GITHUB_TOKEN` above is left blank.

Leave both blank if you're deploying to a host with a real disk (a VM,
Oracle Cloud) — local JSON files work fine there.

## 7. Deploy — Render free tier + keep-alive ping

No credit card needed anywhere in this path.

This bot has no real web UI, but Render's free tier only offers the "Web
Service" type for free (Background Worker requires a paid plan), and Web
Services need something listening on a port. The bot already has a tiny
`/health` endpoint for exactly this — it doesn't do anything else.

1. **New → Web Service** on render.com → connect the `resource-faq-bot`
   repo.
2. Build command: `npm install`. Start command: `npm start`.
3. Add your environment variables (`DISCORD_TOKEN`, `REVIEW_CHANNEL_ID`,
   `MOD_ROLE_ID`, and whichever storage vars from step 6 you're using).
4. Deploy. Check the logs for `[bot] logged in as...` and
   `[web] health listener up on...`.

**The one thing that actually matters here:** Render puts free Web
Services to sleep after 15 minutes with no incoming HTTP requests — and
since this bot's only HTTP traffic is that `/health` endpoint, without
something pinging it, Render *will* sleep it, which kills the Discord
connection along with it. Fix:

5. Sign up free at **uptimerobot.com** (no card needed either).
6. Add an HTTP(S) monitor hitting `https://your-app.onrender.com/health`
   every 5 minutes.

As long as that ping keeps running, Render never sees 15 minutes of
inactivity and the bot stays connected indefinitely. This is a genuinely
solid free setup for a bot this lightweight — the only real risk is if the
monitor itself ever has a gap, which is rare but not impossible.

### If you ever get access to a card

A real VM (Oracle Cloud's Always Free tier, or GCP's `e2-micro` Always Free
instance as a backup if Oracle's identity check gives you trouble) removes
the keep-alive dependency entirely — no port, no sleep, no monitor needed,
it just runs. Worth switching to eventually if that becomes an option,
but it's not required — the Render setup above is a legitimate long-term
home for this bot as-is.

### Why not Vercel?

Comes up a lot since it's free and popular, but it only runs serverless
functions, not a persistent process — this bot keeps a live WebSocket to
Discord's Gateway (for the approve/reject buttons, autocomplete, etc.), and
serverless functions get frozen between requests, which drops that
connection. Vercel only works for bots rebuilt around Discord's HTTP
Interactions endpoint instead of the Gateway — a different architecture,
not a drop-in deploy target here.

---

<div align="center">

**Author:** [cGradying](https://github.com/cGradying)

![astra cosmic](https://img.shields.io/badge/cGradying-astra%20cosmic-F97316?style=for-the-badge&labelColor=0B1120)

</div>

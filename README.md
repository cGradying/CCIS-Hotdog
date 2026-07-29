# Resource/FAQ Bot

Discord bot backing a per-subject resource library with a moderated submission
queue. Entirely slash-command driven — no web UI, no admin panel.

Node >= 18, ESM (`"type": "module"`). Separate Discord application, token and
data store from any other bot.

## Stack

| Concern | Package |
|---|---|
| Discord gateway, slash commands, components | `discord.js` ^14 |
| Optional persistence | `mongodb` |
| GitHub-backed persistence | `fetch` (built-in), no dependency |

## Architecture

```
src/index.js   bare /health HTTP listener + boots the client
src/bot.js     one interactionCreate handler: commands, autocomplete, buttons
src/config.js  env → config object
src/store.js   persistence, backend chosen at runtime
```

Command handling is deliberately single-file. Slash commands, autocomplete
responses and approve/reject button routing all live in one
`interactionCreate` handler in `bot.js`.

`index.js` adds only a `/health` listener so hosts that require an open port
do not idle the process out.

### Storage backends

Priority order, first match wins:

1. **GitHub as a database** — `GITHUB_TOKEN` + `GITHUB_DATA_REPO` set.
   Commits the JSON file through the contents API, re-fetching the blob SHA
   immediately before each write. Yields a full audit history via `git log`.
2. **MongoDB** — `MONGODB_URI` set. Database name `resource_faq_bot`.
3. **Local file** — `data/resources.json`.

Every mutation reads the whole store, mutates in memory, and writes it back.
There is no partial-update path; keep new mutations in that shape.

### Data model

```jsonc
{
  "resources": [ /* … */ ],
  "subjectChannels": { "<subjectKey>": "<channelId>" }
}
```

`normalizeStoreShape` still upgrades the older bare-array format on read.

**Subject codes are normalized twice.** `normalizeSubject` strips all
whitespace and uppercases to produce the lookup key (`subjectKey`);
`displaySubject` produces the canonical `"COMP 001"` shown to users. Always
match on `subjectKey`, never the display string. `COMP 001`, `comp001` and
`  Geed    004 ` therefore resolve to one entry.

**Resources carry two message refs:**

| Ref | Points at |
|---|---|
| `reviewRef` | The submission message in the review channel, and its attachment |
| `postedRef` | The permanent post after approval |

Attached files are never re-hosted. A fresh attachment URL is pulled from the
review message at approval time and users are handed a message link, because
raw Discord CDN URLs expire.

Button custom IDs are `res_review:<approve|reject>:<resourceId>`. The
`resource-remove` autocomplete returns the resource **id** as its value so
similarly-titled entries stay unambiguous.

Permission checks route through `isModerator()`: `MOD_ROLE_ID` when
configured, otherwise the `ManageGuild` permission.

## Discord application setup

1. <https://discord.com/developers/applications> → **New Application**.
   This must be its own application, not one shared with another bot.
2. **Bot** → **Reset Token** → `DISCORD_TOKEN`.
3. **OAuth2 → URL Generator** → scopes `bot`, `applications.commands`;
   permissions `Send Messages`, `Embed Links`, `Use Slash Commands`.
4. Enable Developer Mode, then copy the review channel's ID →
   `REVIEW_CHANNEL_ID`.
5. Optional: copy the moderator role ID → `MOD_ROLE_ID`. Blank falls back to
   `ManageGuild`.

## Configuration

`cp .env.example .env`

| Variable | Required | Notes |
|---|---|---|
| `DISCORD_TOKEN` | yes | |
| `REVIEW_CHANNEL_ID` | yes | Where submissions land for approval |
| `MOD_ROLE_ID` | no | Blank → anyone with Manage Server |
| `GITHUB_TOKEN` | no | Classic token, `repo` scope. Enables GitHub backend |
| `GITHUB_DATA_REPO` | no | `owner/repo`. Use a **separate** repo from the code |
| `GITHUB_DATA_BRANCH` | no | Default `main` |
| `GITHUB_DATA_PATH` | no | Default `resources.json`; created on first write |
| `MONGODB_URI` | no | Used only when `GITHUB_TOKEN` is blank |

`config.js` reads all env vars into one exported object. `assertConfig()`
warns on missing values rather than exiting.

Point `GITHUB_DATA_REPO` at a repo that does not deploy this bot — otherwise
every submission pushes a commit and can trigger a redeploy loop.

## Run

```
npm install
npm start          # node src/index.js
```

Expect `[bot] logged in as…` and `[web] health listener up on…`.

Slash commands are re-registered globally on every `ready` via
`REST.put(Routes.applicationCommands(...))`, so command changes take effect on
restart with no separate deploy script.

## Slash commands

| Command | Access | Behavior |
|---|---|---|
| `/resource-add subject title [link] [file]` | anyone | Submit a resource. At least one of `link`/`file` required. Posts to the review queue with Approve/Reject buttons |
| `/resources subject [search]` | anyone | List approved resources. `subject` autocompletes from approved entries; `search` narrows by title, scoped to the chosen subject |
| `/resource-remove subject title` | mods | Delete by resource id. Autocomplete lists pending, approved and rejected, labeled. Best-effort cleanup of the associated Discord message |
| `/resource-pending` | mods | List submissions awaiting review |
| `/subject-channel-set subject channel` | mods | Map a subject to a channel **or thread** for auto-posting on approval |
| `/subject-channel-list` | mods | Dump all current mappings |

Subject autocomplete is derived from approved resources at query time — there
is no subject list to maintain.

A mapped subject re-posts approved resources into its channel/thread using a
distinct embed style. Mappings can be set before any resource exists for that
subject and re-pointed at any time (e.g. after archiving a forum thread) with
no redeploy.

Log prefixes: `[bot]`, `[web]`, `[config]`.

---

<div align="center">

[![Author: cGradying](https://img.shields.io/badge/cGradying-AUTHOR-10B981?style=for-the-badge&labelColor=0B1120)](https://github.com/cGradying)

</div>

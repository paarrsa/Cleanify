# Cleanify

Cleanify is a Telegram bot that helps channel admins bulk-clean up their channels. Forward the
first and last message of a range, confirm, and Cleanify deletes everything in between — no more
manually deleting hundreds of messages one at a time.

> **Status:** actively being rebuilt from a PHP prototype into a modern, open-source,
> production-ready TypeScript project. See [`legacy-php/`](legacy-php) for the previous
> implementation (kept for reference during the migration, not deployed).

## Features

- **Bulk range delete** — forward two messages from your channel, confirm the estimated count,
  and Cleanify deletes everything between them.
- **Confirm before delete** — no accidental mass deletions; you see a count and confirm first.
- **Multi-channel support** — manage more than one channel from a single account.
- **Cleanup history** — an audit log of past cleanups (message ranges and timestamps only, never
  message content).
- **Scheduled auto-cleanup** — optionally auto-delete messages older than N days, going forward
  from whenever Cleanify starts watching a channel (`/autocleanup`, `/autocleanup off`). Checked
  roughly once a minute (see [Background jobs](#background-jobs)), so a message is deleted within
  about a minute of crossing its configured age rather than sitting for up to an hour.
- **Force join** — when `FORCE_JOIN_CHANNEL` is set, users must join that channel before they
  can use the bot (users in `ADMIN_USER_IDS` are exempt). The bot must be an admin of the channel
  to check membership; if it can't, users are let through rather than locked out.
- **Admin broadcast** — `/broadcast`, restricted to `ADMIN_USER_IDS`, replacing the legacy bot's
  unauthenticated broadcast endpoint. Send any content (text/photo/video/document — sent as-is,
  formatting included), pick an audience (all users, by language, or channel admins only) and
  whether it's silent, then confirm. A live progress message tracks sent/failed/remaining as it
  goes, and the final report breaks down _why_ any sends failed. Sending itself is queued and
  drained in small batches (see [Background jobs](#background-jobs)) rather than blocking the bot,
  so it isn't limited by how many recipients there are.
- **English and Persian** UI out of the box, with a straightforward path for contributing more
  languages.

## Tech stack

- [grammY](https://grammy.dev) (TypeScript-first Telegram Bot API framework), running long
  polling under [PM2](https://pm2.keymetrics.io)
- [Neon](https://neon.tech) (serverless Postgres, works fine as a normal pooled connection from a
  persistent process) + [Drizzle ORM](https://orm.drizzle.team)
- [Vitest](https://vitest.dev) for testing

## Getting started

### Prerequisites

- Node.js 20+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A [Neon](https://neon.tech) Postgres database (or any Postgres — Neon isn't required)

### Local setup

```bash
npm install
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN, DATABASE_URL, ADMIN_USER_IDS
npm run db:migrate
npm run dev             # tsx watch src/index.ts — restarts on file changes
```

Cleanify uses long polling (the bot pulls updates from Telegram itself), so there's no public
HTTPS endpoint, domain, or webhook setup needed to test locally or in production — `npm run dev`
talks to real Telegram and your real database immediately.

### Background jobs

Two things need to happen on a timer rather than in response to a Telegram update: draining a
queued `/broadcast` job in small batches, and sweeping channels for auto-cleanup-eligible
messages. Because Cleanify runs as one persistent process instead of short-lived functions, this
is just a plain `setInterval` inside `src/index.ts` (roughly once a minute) — no external
scheduler or extra authentication needed. New periodic work should be added there.

## Deployment (VPS + PM2)

Assumes Node.js 20+ and [PM2](https://pm2.keymetrics.io) (`npm install -g pm2`) are already
installed on the server.

```bash
git clone https://github.com/paarrsa/Cleanify.git
cd Cleanify
npm install --omit=dev
cp .env.example .env
nano .env                 # fill in TELEGRAM_BOT_TOKEN, DATABASE_URL, ADMIN_USER_IDS, ...
npm run db:migrate        # applies any pending schema migrations
pm2 start ecosystem.config.cjs
pm2 save                  # persists the process list
pm2 startup               # prints (and can run) the command to restore it on server reboot
```

`--omit=dev` skips lint/test/build tooling (eslint, vitest, drizzle-kit, ...) — none of it is
needed to actually run the bot, and skipping it avoids those packages' stricter Node version
requirements getting in the way on an older server Node install. `npm install` rather than
`npm ci` deliberately: older npm (this repo has hit it on 10.8.2) can fail `npm ci` outright on
optional platform-specific packages that don't match the current OS/CPU (esbuild ships one per
platform) instead of just skipping them, which is exactly the kind of thing `npm install` is more
forgiving about.

`ecosystem.config.cjs` runs `src/index.ts` via `tsx` as a single PM2-managed process —
deliberately **one instance, not cluster mode**: long polling and the cron loop both assume
they're the only thing running, since two instances would each poll Telegram and process every
broadcast/cleanup batch independently.

**Deploying an update:**

```bash
cd Cleanify
git pull
npm install --omit=dev
npm run db:migrate        # no-op if there's nothing new to apply
pm2 startOrReload ecosystem.config.cjs
```

Use `startOrReload`, not `restart`/`reload cleanify` — those reuse whatever `cwd`/script settings
the process was _first_ registered with instead of re-reading `ecosystem.config.cjs`, so a fix to
this file (or a bad first registration) can silently stick around across restarts.

**Operating:**

| Command                | What it does                              |
| ---------------------- | ----------------------------------------- |
| `pm2 logs cleanify`    | Tail logs                                 |
| `pm2 status`           | Check it's running, uptime, restart count |
| `pm2 restart cleanify` | Hard restart                              |
| `pm2 monit`            | Live CPU/memory view                      |

If you're moving from an existing webhook-based deployment (e.g. Netlify), nothing needs to be
unregistered by hand — the first time this process starts, grammY's `bot.start()` automatically
calls Telegram's `deleteWebhook`, switching the bot over to polling. Just make sure the old
deployment is stopped/removed around the same time so only one thing is trying to receive updates.

### Scripts

| Command                                     | Description                                      |
| ------------------------------------------- | ------------------------------------------------ |
| `npm run dev`                               | Run locally with auto-restart on file changes    |
| `npm start`                                 | Run once, no auto-restart (what PM2 invokes)     |
| `npm run lint` / `lint:fix`                 | ESLint                                           |
| `npm run format` / `format:check`           | Prettier                                         |
| `npm run typecheck`                         | `tsc --noEmit`                                   |
| `npm test` / `test:watch` / `test:coverage` | Vitest                                           |
| `npm run db:generate`                       | Generate a Drizzle migration from schema changes |
| `npm run db:migrate`                        | Apply migrations to `DATABASE_URL`               |
| `npm run db:studio`                         | Open Drizzle Studio against `DATABASE_URL`       |

## Architecture

```
src/index.ts           Entry point: starts the bot (long polling) and the cron loop
src/bot/                grammY bot: commands, multi-step flows, keyboards, middleware
src/jobs/               Background work driven by src/index.ts (broadcast draining, auto-cleanup)
src/db/                 Drizzle schema, migrations, repositories
src/telegram/           Reusable Telegram API helpers (e.g. chunked/rate-limit-aware deletion)
src/i18n/               Translation strings and loader
src/config/             Environment variable validation
```

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md), including how to add a new
language translation.

## License

[GPL-3.0](LICENSE) — if you distribute a modified version of Cleanify, it must also be
open-sourced under the same license.

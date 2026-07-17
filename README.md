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
  from whenever Cleanify starts watching a channel.
- **English and Persian** UI out of the box, with a straightforward path for contributing more
  languages.

## Tech stack

- [grammY](https://grammy.dev) (TypeScript-first Telegram Bot API framework)
- [Netlify Functions](https://docs.netlify.com/functions/overview/) (serverless hosting)
- [Neon](https://neon.tech) (serverless Postgres) + [Drizzle ORM](https://orm.drizzle.team)
- [Vitest](https://vitest.dev) + [msw](https://mswjs.io) for testing

## Getting started

### Prerequisites

- Node.js 20+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A [Neon](https://neon.tech) Postgres database
- The [Netlify CLI](https://docs.netlify.com/cli/get-started/) for local development

### Setup

```bash
npm install
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, DATABASE_URL, ...
npm run db:migrate
npm run dev             # runs `netlify dev`, serving functions locally
```

Telegram can't deliver webhooks to `localhost` directly. For real end-to-end testing, register a
second, throwaway bot via BotFather and point it at a Netlify Deploy Preview URL:

```bash
npm run setup-webhook -- https://<your-deploy-preview>.netlify.app/webhook
```

Day-to-day development should rely on the unit/integration test suite (mocked Telegram API,
in-memory Postgres) rather than live webhook delivery.

### Scripts

| Command                                     | Description                                      |
| ------------------------------------------- | ------------------------------------------------ |
| `npm run dev`                               | Run the site + functions locally via Netlify CLI |
| `npm run lint` / `lint:fix`                 | ESLint                                           |
| `npm run format` / `format:check`           | Prettier                                         |
| `npm run typecheck`                         | `tsc --noEmit`                                   |
| `npm test` / `test:watch` / `test:coverage` | Vitest                                           |
| `npm run db:generate`                       | Generate a Drizzle migration from schema changes |
| `npm run db:migrate`                        | Apply migrations to `DATABASE_URL`               |
| `npm run db:studio`                         | Open Drizzle Studio against `DATABASE_URL`       |
| `npm run setup-webhook -- <url>`            | Point Telegram's webhook at a deployed URL       |

## Architecture

```
netlify/functions/   Thin adapters: verify the request, delegate into src/bot
src/bot/              grammY bot: commands, multi-step flows, keyboards, middleware
src/db/                Drizzle schema, migrations, repositories
src/telegram/          Reusable Telegram API helpers (e.g. chunked/rate-limit-aware deletion)
src/i18n/               Translation strings and loader
src/config/             Environment variable validation
```

`src/` is framework-agnostic; `netlify/functions/` only adapts requests/responses, so the hosting
layer can change without touching bot logic.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md), including how to add a new
language translation.

## License

[GPL-3.0](LICENSE) — if you distribute a modified version of Cleanify, it must also be
open-sourced under the same license.

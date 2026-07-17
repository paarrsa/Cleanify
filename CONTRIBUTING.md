# Contributing to Cleanify

Thanks for considering a contribution! This document covers local setup, project conventions,
and how to add a new language.

## Local setup

See the [README](README.md#getting-started) for installing dependencies and configuring `.env`.

Before opening a PR, make sure these all pass:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
```

CI runs the same checks on every push and pull request against `main`.

## Project conventions

- `src/` holds framework-agnostic bot/business logic; `netlify/functions/` should stay a thin
  adapter layer (parse the request, verify auth, call into `src/`, shape the response).
- Multi-step user flows (e.g. the delete-range flow) are explicit state machines persisted per
  chat, not implicit control flow — see `src/bot/state/`. Keep transition logic as small, pure,
  unit-testable functions.
- Prefer inline keyboards (`callback_query`) over matching literal reply-keyboard button text.
- Never log or store full message content — only IDs, ranges, and timestamps (see `audit_log` and
  `message_log` in `src/db/schema.ts`).
- Secrets always come from environment variables (validated in `src/config/env.ts`), never
  hardcoded.

## Adding a new language

Translations live in `src/i18n/<locale>.json`, keyed the same way as `src/i18n/en.json`. To add a
language:

1. Copy `src/i18n/en.json` to `src/i18n/<locale>.json` (use the language's
   [BCP 47](https://en.wikipedia.org/wiki/IETF_language_tag) subtag, e.g. `de`, `tr`, `ar`).
2. Translate every value; keep placeholder tokens (e.g. `{count}`) intact.
3. Register the locale in `src/i18n/index.ts`.
4. Add it to the `/language` command's selection keyboard in `src/bot/keyboards/languageSelect.ts`.
5. Missing keys automatically fall back to English, so partial translations are safe to submit —
   but please open an issue noting what's incomplete.

## Testing expectations

- Business logic (state machines, permission checks, chunking math, i18n fallback) should be
  covered by unit tests in `test/unit/`.
- Handler-level changes should include an integration test in `test/integration/` using the
  Telegram API mocks in `test/mocks/telegramApi.ts` and fixture updates in `test/fixtures/`.
- Changes that can't be meaningfully covered by automated tests (live client rendering, real
  Telegram rate-limit behavior) should be verified manually against a staging bot — mention what
  you tested manually in your PR description.

## Reporting security issues

Please don't open a public issue for security vulnerabilities. Instead, contact the maintainers
directly (see the repository's contact details) so a fix can be prepared before disclosure.

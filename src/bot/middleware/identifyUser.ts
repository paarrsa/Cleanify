import type { NextFunction } from 'grammy';

import type { BotContext } from '@/bot/context.js';
import { languageSelectKeyboard } from '@/bot/keyboards/languageSelect.js';
import type { Database } from '@/db/client.js';
import { getUser, upsertUser } from '@/db/repositories/users.js';
import { DEFAULT_LOCALE, isSupportedLocale, t } from '@/i18n/index.js';

/**
 * Upserts the calling user and resolves `ctx.locale`. If the user hasn't picked a language yet,
 * shows the language-selection prompt and short-circuits (matching the legacy bot's behavior of
 * gating all other interaction on language selection) — except for the language-selection
 * command/callback itself, which must be allowed through.
 */
export function createIdentifyUserMiddleware(db: Database) {
  return async (ctx: BotContext, next: NextFunction) => {
    if (!ctx.from) {
      return next();
    }

    await upsertUser(db, { id: ctx.from.id, username: ctx.from.username ?? null });
    const user = await getUser(db, ctx.from.id);
    const language = user?.language;

    const isLanguageSelection =
      ctx.message?.text === '/en' ||
      ctx.message?.text === '/fa' ||
      (ctx.callbackQuery?.data?.startsWith('lang:') ?? false);

    if (!language || !isSupportedLocale(language)) {
      if (isLanguageSelection) {
        ctx.locale = DEFAULT_LOCALE;
        return next();
      }
      await ctx.reply(t(DEFAULT_LOCALE, 'language.prompt'), {
        reply_markup: languageSelectKeyboard(),
      });
      return;
    }

    ctx.locale = language;
    return next();
  };
}

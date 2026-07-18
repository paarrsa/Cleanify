import type { NextFunction } from 'grammy';

import type { BotContext } from '@/bot/context.js';
import { languageSelectKeyboard } from '@/bot/keyboards/languageSelect.js';
import type { Database } from '@/db/client.js';
import { upsertUser } from '@/db/repositories/users.js';
import { DEFAULT_LOCALE, isSupportedLocale, t } from '@/i18n/index.js';

/**
 * Upserts the calling user and resolves `ctx.locale`. If the user hasn't picked a language yet,
 * shows the language-selection prompt and short-circuits (matching the legacy bot's behavior of
 * gating all other interaction on language selection) — except for the language-selection
 * command/callback itself, which must be allowed through.
 */
export function createIdentifyUserMiddleware(db: Database) {
  return async (ctx: BotContext, next: NextFunction) => {
    // channel_post updates have `from` set to the posting admin when the channel signs messages,
    // but there's no DM to reply into — ctx.reply() there sends into the channel itself, which
    // rejects a ReplyKeyboardRemove/inline-keyboard-gated prompt outright. This flow only makes
    // sense for someone actually conversing with the bot.
    if (!ctx.from || ctx.channelPost) {
      return next();
    }

    const user = await upsertUser(db, { id: ctx.from.id, username: ctx.from.username ?? null });
    const language = user.language;

    const isLanguageSelection =
      ctx.message?.text === '/en' ||
      ctx.message?.text === '/fa' ||
      (ctx.callbackQuery?.data?.startsWith('lang:') ?? false);

    if (!language || !isSupportedLocale(language)) {
      if (isLanguageSelection) {
        ctx.locale = DEFAULT_LOCALE;
        return next();
      }
      // Clears the legacy bot's persistent reply-keyboard buttons, which otherwise linger at the
      // bottom of the chat forever — a ReplyKeyboardMarkup can only be cleared by a message
      // carrying remove_keyboard, it isn't replaced just by sending an inline keyboard elsewhere.
      await ctx.reply(t(DEFAULT_LOCALE, 'language.clearingOldMenu'), {
        reply_markup: { remove_keyboard: true },
      });
      await ctx.reply(t(DEFAULT_LOCALE, 'language.prompt'), {
        reply_markup: languageSelectKeyboard(),
      });
      return;
    }

    ctx.locale = language;
    return next();
  };
}

import type { BotContext } from '@/bot/context.js';
import { mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import type { Database } from '@/db/client.js';
import { setUserLanguage } from '@/db/repositories/users.js';
import { isSupportedLocale, t, type Locale } from '@/i18n/index.js';

export function createLanguageHandlers(db: Database) {
  async function applyLanguage(ctx: BotContext, locale: Locale) {
    if (!ctx.from) return;
    await setUserLanguage(db, ctx.from.id, locale);
    ctx.locale = locale;
    await ctx.reply(t(locale, 'start'), { reply_markup: mainMenuKeyboard(locale) });
  }

  return {
    fromCommand: (locale: Locale) => (ctx: BotContext) => applyLanguage(ctx, locale),
    async fromCallback(ctx: BotContext) {
      const data = ctx.callbackQuery?.data;
      const locale = data?.split(':')[1];
      await ctx.answerCallbackQuery();
      if (locale && isSupportedLocale(locale)) {
        await applyLanguage(ctx, locale);
      }
    },
  };
}

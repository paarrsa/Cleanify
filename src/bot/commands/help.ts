import type { BotContext } from '@/bot/context.js';
import { mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import { t } from '@/i18n/index.js';

export async function helpCommand(ctx: BotContext) {
  await ctx.reply(t(ctx.locale, 'help.text'), { reply_markup: mainMenuKeyboard(ctx.locale) });
}

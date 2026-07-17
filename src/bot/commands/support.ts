import type { BotContext } from '@/bot/context.js';
import { t } from '@/i18n/index.js';

export async function supportCommand(ctx: BotContext) {
  await ctx.reply(t(ctx.locale, 'support'));
}

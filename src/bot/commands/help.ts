import type { BotContext } from '@/bot/context.js';
import { getEnv } from '@/config/env.js';
import { t } from '@/i18n/index.js';

export async function helpCommand(ctx: BotContext) {
  const { HELP_VIDEO_FILE_ID } = getEnv();
  if (HELP_VIDEO_FILE_ID) {
    await ctx.replyWithVideo(HELP_VIDEO_FILE_ID, {
      caption: t(ctx.locale, 'help.caption'),
      supports_streaming: true,
    });
    return;
  }
  await ctx.reply(t(ctx.locale, 'help.caption'));
}

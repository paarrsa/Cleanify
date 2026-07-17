import type { BotContext } from '@/bot/context.js';
import type { Database } from '@/db/client.js';
import { getChannelsForUser } from '@/db/repositories/channels.js';
import { t } from '@/i18n/index.js';

export function createChannelsCommand(db: Database) {
  return async (ctx: BotContext) => {
    if (!ctx.from) return;

    const rows = await getChannelsForUser(db, ctx.from.id);
    if (rows.length === 0) {
      await ctx.reply(t(ctx.locale, 'channels.empty'));
      return;
    }

    const lines = rows.map((row) => {
      const label = row.channel.title ?? row.channel.username ?? String(row.channel.telegramChatId);
      const autoCleanupSuffix =
        row.channel.autoCleanupEnabled && row.channel.autoCleanupDays
          ? t(ctx.locale, 'channels.autoCleanupSuffix', { days: row.channel.autoCleanupDays })
          : '';
      return `• ${label} (${row.role})${autoCleanupSuffix}`;
    });

    await ctx.reply(`${t(ctx.locale, 'channels.title')}\n\n${lines.join('\n')}`);
  };
}

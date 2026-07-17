import type { BotContext } from '@/bot/context.js';
import type { Database } from '@/db/client.js';
import { getRecentAuditLogWithChannelForUser } from '@/db/repositories/auditLog.js';
import { t } from '@/i18n/index.js';

interface DeleteRangeSummary {
  attemptedCount?: number;
}

export function createHistoryCommand(db: Database) {
  return async (ctx: BotContext) => {
    if (!ctx.from) return;

    const entries = await getRecentAuditLogWithChannelForUser(db, ctx.from.id);
    if (entries.length === 0) {
      await ctx.reply(t(ctx.locale, 'history.empty'));
      return;
    }

    const lines = entries.map((row) => {
      const summary = row.entry.summary as DeleteRangeSummary;
      const channel = row.channelTitle ?? row.channelUsername ?? String(row.entry.channelId ?? '');
      return t(ctx.locale, 'history.entry', {
        date: row.entry.createdAt.toISOString().slice(0, 10),
        channel,
        count: summary.attemptedCount ?? 0,
      });
    });

    await ctx.reply(`${t(ctx.locale, 'history.title')}\n\n${lines.join('\n')}`);
  };
}

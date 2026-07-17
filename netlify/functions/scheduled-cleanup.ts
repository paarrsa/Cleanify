import type { Config } from '@netlify/functions';
import { Api } from 'grammy';

import { getEnv } from '@/config/env.js';
import { getDb } from '@/db/client.js';
import { recordAuditLogEntry } from '@/db/repositories/auditLog.js';
import {
  getAnyChannelMember,
  getChannelsWithAutoCleanupEnabled,
} from '@/db/repositories/channels.js';
import { createJob, updateJobStatus } from '@/db/repositories/jobs.js';
import { deleteMessageLogEntries, getOldMessageIds } from '@/db/repositories/messageLog.js';
import { logger } from '@/logging/logger.js';
import { deleteMessagesByIds } from '@/telegram/deleteQueue.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Runs on a cron schedule (see `config.schedule` below). For every channel with auto-cleanup
 * enabled, deletes messages older than its configured retention window. Only ever covers
 * messages the bot has personally observed via `channel_post` since it started watching the
 * channel (see `message_log` / the schema comment on `channels.autoCleanupEnabled`) — it cannot
 * retroactively clean pre-install history.
 */
export default async (): Promise<Response> => {
  const env = getEnv();
  const db = getDb();
  const api = new Api(env.TELEGRAM_BOT_TOKEN);

  const channels = await getChannelsWithAutoCleanupEnabled(db);
  let processed = 0;

  for (const channel of channels) {
    if (!channel.autoCleanupDays) continue;

    const cutoff = new Date(Date.now() - channel.autoCleanupDays * MS_PER_DAY);
    const ids = await getOldMessageIds(db, channel.id, cutoff);
    if (ids.length === 0) continue;

    const member = await getAnyChannelMember(db, channel.id);
    if (!member) continue;

    const job = await createJob(db, {
      type: 'scheduled_cleanup',
      channelId: channel.id,
      requestedBy: member.userId,
      payload: { telegramChatId: channel.telegramChatId, candidateCount: ids.length },
      status: 'running',
    });

    try {
      const { attemptedCount } = await deleteMessagesByIds(api, channel.telegramChatId, ids);
      await deleteMessageLogEntries(db, channel.id, ids);
      await recordAuditLogEntry(db, {
        jobId: job.id,
        channelId: channel.id,
        actorUserId: member.userId,
        action: 'scheduled_cleanup',
        summary: { attemptedCount },
      });
      await updateJobStatus(db, job.id, 'completed', new Date());
      processed += 1;
    } catch (error) {
      logger.error({ error, channelId: channel.id }, 'Scheduled cleanup failed for channel');
      await updateJobStatus(db, job.id, 'failed', new Date());
    }
  }

  logger.info(
    { channelsProcessed: processed, channelsEligible: channels.length },
    'Scheduled cleanup run complete',
  );
  return new Response('ok');
};

export const config: Config = {
  schedule: '0 * * * *',
};

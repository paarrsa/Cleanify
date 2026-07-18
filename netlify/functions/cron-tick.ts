import { Api } from 'grammy';

import { getEnv } from '@/config/env.js';
import { getDb } from '@/db/client.js';
import { processBroadcastBatch } from '@/jobs/processBroadcastBatch.js';
import { runScheduledCleanup } from '@/jobs/runScheduledCleanup.js';
import { logger } from '@/logging/logger.js';
import { isValidWebhookSecret } from '@/telegram/verifyWebhookSecret.js';

/**
 * The single endpoint an external scheduler (this project uses cron-job.org, since Netlify's own
 * Scheduled Functions don't support sub-minute intervals on every plan) hits roughly once a
 * minute to drive every time-based background task Cleanify has — draining queued broadcasts and
 * sweeping for auto-cleanup-eligible messages. One trigger, one secret, one cron-job.org job:
 * new periodic work should be added here rather than wiring up another scheduler.
 */
export default async (req: Request): Promise<Response> => {
  const env = getEnv();
  const url = new URL(req.url);
  const secret = req.headers.get('X-Cron-Secret') ?? url.searchParams.get('secret');
  if (!isValidWebhookSecret(secret, env.CRON_SECRET)) {
    logger.warn('Rejected cron-tick request with invalid secret');
    return new Response('Unauthorized', { status: 401 });
  }

  const db = getDb();
  const api = new Api(env.TELEGRAM_BOT_TOKEN);

  const [broadcastResult, cleanupResult] = await Promise.all([
    processBroadcastBatch(db, api),
    runScheduledCleanup(db, api),
  ]);

  logger.info({ broadcastResult, cleanupResult }, 'Cron tick complete');
  return new Response('ok');
};

import 'dotenv/config';

import { createBot } from '@/bot/createBot.js';
import { getEnv } from '@/config/env.js';
import { closeDb, getDb } from '@/db/client.js';
import { processBroadcastBatch } from '@/jobs/processBroadcastBatch.js';
import { runScheduledCleanup } from '@/jobs/runScheduledCleanup.js';
import { pruneUnusedMessageLog } from '@/db/repositories/messageLog.js';
import { logger } from '@/logging/logger.js';

/** How often to drain queued broadcasts and sweep for auto-cleanup-eligible messages. A message
 * is deleted within about this long of crossing its configured retention age. */
const CRON_INTERVAL_MS = 60_000;

async function main() {
  getEnv(); // validate config up front — fail fast on a bad/missing env var, not on first use

  const db = getDb();
  const bot = createBot(db);

  let cronRunning = false;
  const cronTimer = setInterval(() => {
    if (cronRunning) {
      // Previous tick is still going (e.g. a large cleanup sweep) — skip rather than overlap.
      return;
    }
    cronRunning = true;
    void Promise.all([
      processBroadcastBatch(db, bot.api),
      runScheduledCleanup(db, bot.api),
      pruneUnusedMessageLog(db),
    ])
      .then(([broadcastResult, cleanupResult, prunedLogRows]) => {
        if (prunedLogRows > 0) logger.info({ prunedLogRows }, 'Pruned unused message_log rows');
        logger.debug({ broadcastResult, cleanupResult }, 'Cron tick complete');
      })
      .catch((error: unknown) => {
        logger.error({ error }, 'Cron tick failed');
      })
      .finally(() => {
        cronRunning = false;
      });
  }, CRON_INTERVAL_MS);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    clearInterval(cronTimer);
    void bot
      .stop()
      .then(() => closeDb())
      .catch((error: unknown) => logger.error({ error }, 'Error during shutdown'))
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info('Starting Cleanify (long polling)');
  await bot.start({
    onStart: (botInfo) => logger.info({ username: botInfo.username }, 'Bot started'),
  });
}

main().catch((error: unknown) => {
  logger.error({ error }, 'Fatal error during startup');
  process.exit(1);
});

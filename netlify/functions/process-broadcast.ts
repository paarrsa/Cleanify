import { Api } from 'grammy';

import { getEnv } from '@/config/env.js';
import { getDb } from '@/db/client.js';
import { recordAuditLogEntry } from '@/db/repositories/auditLog.js';
import {
  getOldestJobByTypeAndStatus,
  updateJobPayload,
  updateJobStatus,
} from '@/db/repositories/jobs.js';
import { DEFAULT_LOCALE, t } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';
import { sendBroadcastBatch, type BroadcastJobPayload } from '@/telegram/broadcastQueue.js';
import { isValidWebhookSecret } from '@/telegram/verifyWebhookSecret.js';

/** Sized to comfortably finish within a serverless function's execution time limit even
 * accounting for occasional flood-control retries — a 504-recipient broadcast takes roughly
 * 25 ticks of the external scheduler to fully drain, not one long-running invocation. */
const BATCH_SIZE = 20;

/**
 * Meant to be hit by an external scheduler (this project uses cron-job.org, since Netlify's own
 * Scheduled Functions don't support sub-minute/every-minute intervals on all plans) roughly once
 * a minute. Drains one batch of the oldest running broadcast job, if any, and persists progress —
 * safe to call with no job queued (no-op) or mid-job (resumes where it left off). Running the
 * send loop here instead of inline in the webhook handler is what keeps a large broadcast from
 * ever risking the webhook's own execution timeout.
 */
export default async (req: Request): Promise<Response> => {
  const env = getEnv();
  const url = new URL(req.url);
  const secret = req.headers.get('X-Cron-Secret') ?? url.searchParams.get('secret');
  if (!isValidWebhookSecret(secret, env.CRON_SECRET)) {
    logger.warn('Rejected process-broadcast request with invalid secret');
    return new Response('Unauthorized', { status: 401 });
  }

  const db = getDb();
  const job = await getOldestJobByTypeAndStatus(db, 'broadcast', 'running');
  if (!job) {
    return new Response('No pending broadcast jobs', { status: 200 });
  }

  const payload = job.payload as BroadcastJobPayload;
  const api = new Api(env.TELEGRAM_BOT_TOKEN);
  const { sentDelta, failedDelta, remainingUserIds } = await sendBroadcastBatch(
    api,
    payload,
    BATCH_SIZE,
  );

  const updatedPayload: BroadcastJobPayload = {
    ...payload,
    sentCount: payload.sentCount + sentDelta,
    failedCount: payload.failedCount + failedDelta,
    remainingUserIds,
  };
  await updateJobPayload(db, job.id, updatedPayload);

  if (remainingUserIds.length > 0) {
    logger.info(
      { jobId: job.id, sent: updatedPayload.sentCount, remaining: remainingUserIds.length },
      'Broadcast batch sent',
    );
    return new Response('ok');
  }

  await updateJobStatus(db, job.id, 'completed', new Date());
  await recordAuditLogEntry(db, {
    jobId: job.id,
    actorUserId: job.requestedBy,
    action: 'broadcast_sent',
    summary: {
      audience: updatedPayload.audience,
      totalCount: updatedPayload.totalCount,
      sentCount: updatedPayload.sentCount,
      failedCount: updatedPayload.failedCount,
    },
  });
  try {
    await api.sendMessage(
      job.requestedBy,
      t(DEFAULT_LOCALE, 'broadcast.completed', {
        sent: updatedPayload.sentCount,
        failed: updatedPayload.failedCount,
      }),
    );
  } catch (error) {
    logger.error({ error, jobId: job.id }, 'Failed to notify admin of broadcast completion');
  }
  logger.info({ jobId: job.id, ...updatedPayload }, 'Broadcast job completed');
  return new Response('ok');
};

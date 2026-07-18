import type { Api } from 'grammy';

import type { Database } from '@/db/client.js';
import { recordAuditLogEntry } from '@/db/repositories/auditLog.js';
import {
  getOldestJobByTypeAndStatus,
  updateJobPayload,
  updateJobStatus,
} from '@/db/repositories/jobs.js';
import { DEFAULT_LOCALE, t } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';
import { sendBroadcastBatch, type BroadcastJobPayload } from '@/telegram/broadcastQueue.js';

/** Sized to comfortably finish within a serverless function's execution time limit even
 * accounting for occasional flood-control retries — a 504-recipient broadcast takes roughly
 * 25 ticks of the external scheduler to fully drain, not one long-running invocation. */
const BATCH_SIZE = 20;

export type ProcessBroadcastBatchResult =
  | { status: 'no_job' }
  | { status: 'batch_sent'; jobId: number; sent: number; remaining: number }
  | { status: 'completed'; jobId: number; sent: number; failed: number };

function mergeFailureReasons(
  cumulative: Record<string, number>,
  delta: Record<string, number>,
): Record<string, number> {
  const merged = { ...cumulative };
  for (const [reason, count] of Object.entries(delta)) {
    merged[reason] = (merged[reason] ?? 0) + count;
  }
  return merged;
}

/** Renders the failure tally as "- reason: count" lines, worst offender first, for the
 * completion report — empty string if nothing failed. */
function formatFailureBreakdown(failureReasons: Record<string, number>): string {
  const entries = Object.entries(failureReasons).sort(([, a], [, b]) => b - a);
  if (entries.length === 0) {
    return '';
  }
  const lines = entries.map(([reason, count]) => `- ${reason}: ${count}`);
  return `\n\n${t(DEFAULT_LOCALE, 'broadcast.failuresHeader')}\n${lines.join('\n')}`;
}

/** Edits the admin-visible progress message; failing to update it (e.g. it's more than 48h old,
 * Telegram's edit window) shouldn't abort an otherwise-successful batch. */
async function updateStatusMessage(api: Api, payload: BroadcastJobPayload, text: string) {
  try {
    await api.editMessageText(payload.statusChatId, payload.statusMessageId, text);
  } catch (error) {
    logger.error({ error }, 'Failed to update broadcast progress message');
  }
}

/**
 * Drains one batch of the oldest running broadcast job, if any, and persists progress — safe to
 * call with no job queued (no-op) or mid-job (resumes where it left off). Running the send loop
 * here instead of inline in the webhook handler is what keeps a large broadcast from ever risking
 * the webhook's own execution timeout. Meant to be invoked repeatedly (see
 * netlify/functions/cron-tick.ts) until the job completes.
 */
export async function processBroadcastBatch(
  db: Database,
  api: Api,
): Promise<ProcessBroadcastBatchResult> {
  const job = await getOldestJobByTypeAndStatus(db, 'broadcast', 'running');
  if (!job) {
    return { status: 'no_job' };
  }

  const payload = job.payload as BroadcastJobPayload;
  const { sentDelta, failedDelta, failureReasons, remainingUserIds } = await sendBroadcastBatch(
    api,
    payload,
    BATCH_SIZE,
  );

  const updatedPayload: BroadcastJobPayload = {
    ...payload,
    sentCount: payload.sentCount + sentDelta,
    failedCount: payload.failedCount + failedDelta,
    failureReasons: mergeFailureReasons(payload.failureReasons, failureReasons),
    remainingUserIds,
  };
  await updateJobPayload(db, job.id, updatedPayload);

  if (remainingUserIds.length > 0) {
    await updateStatusMessage(
      api,
      updatedPayload,
      t(DEFAULT_LOCALE, 'broadcast.progress', {
        sent: updatedPayload.sentCount,
        failed: updatedPayload.failedCount,
        remaining: remainingUserIds.length,
        total: updatedPayload.totalCount,
      }),
    );
    logger.info(
      { jobId: job.id, sent: updatedPayload.sentCount, remaining: remainingUserIds.length },
      'Broadcast batch sent',
    );
    return {
      status: 'batch_sent',
      jobId: job.id,
      sent: updatedPayload.sentCount,
      remaining: remainingUserIds.length,
    };
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

  const completionText = t(DEFAULT_LOCALE, 'broadcast.completed', {
    sent: updatedPayload.sentCount,
    failed: updatedPayload.failedCount,
    breakdown: formatFailureBreakdown(updatedPayload.failureReasons),
  });
  await updateStatusMessage(api, updatedPayload, completionText);
  try {
    // A message edit doesn't push a notification — send a fresh message too so the admin
    // actually gets pinged that a (possibly many-minutes-long) broadcast has finished.
    await api.sendMessage(job.requestedBy, completionText);
  } catch (error) {
    logger.error({ error, jobId: job.id }, 'Failed to notify admin of broadcast completion');
  }
  logger.info({ jobId: job.id, ...updatedPayload }, 'Broadcast job completed');
  return {
    status: 'completed',
    jobId: job.id,
    sent: updatedPayload.sentCount,
    failed: updatedPayload.failedCount,
  };
}

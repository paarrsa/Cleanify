import { GrammyError, type Api } from 'grammy';

import { withFloodWaitRetry } from '@/telegram/deleteQueue.js';

export type BroadcastAudience = 'all' | 'en' | 'fa' | 'admins';

/** Persisted shape of a `jobs.payload` row for a `type: 'broadcast'` job. The message to send is
 * referenced by where the admin sent it (their DM with the bot), not stored inline — `copyMessage`
 * re-sends it as-is (text, photo, video, document, formatting, whatever it is) to each recipient.
 * `statusChatId`/`statusMessageId` point at the live progress message shown to the admin, edited
 * in place on every batch rather than posting a new message each tick. */
export interface BroadcastJobPayload {
  fromChatId: number;
  messageId: number;
  silent: boolean;
  audience: BroadcastAudience;
  remainingUserIds: number[];
  totalCount: number;
  sentCount: number;
  failedCount: number;
  /** Tally of failures by Telegram's error description (e.g. "Forbidden: bot was blocked by the
   * user"), so a stuck/erroring broadcast is diagnosable instead of just a raw failed count. */
  failureReasons: Record<string, number>;
  statusChatId: number;
  statusMessageId: number;
}

export interface BroadcastBatchResult {
  sentDelta: number;
  failedDelta: number;
  failureReasons: Record<string, number>;
  remainingUserIds: number[];
}

function describeSendError(error: unknown): string {
  if (error instanceof GrammyError) {
    return error.description;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}

/**
 * Sends the next batch (up to `batchSize` recipients) of a queued broadcast job via `copyMessage`,
 * one recipient at a time, retrying individual sends on flood control. A failed send (e.g. the
 * user blocked the bot, or deleted their account) is expected and non-fatal — it's counted (and
 * its reason tallied), not thrown. The caller persists the returned `remainingUserIds` and
 * re-invokes this for the next batch until it's empty; batching keeps each call well within a
 * serverless function's execution time limit regardless of how large the recipient list is.
 */
export async function sendBroadcastBatch(
  api: Pick<Api, 'copyMessage'>,
  payload: Pick<BroadcastJobPayload, 'fromChatId' | 'messageId' | 'silent' | 'remainingUserIds'>,
  batchSize: number,
): Promise<BroadcastBatchResult> {
  const batch = payload.remainingUserIds.slice(0, batchSize);
  let sentDelta = 0;
  let failedDelta = 0;
  const failureReasons: Record<string, number> = {};
  for (const userId of batch) {
    try {
      await withFloodWaitRetry(() =>
        api.copyMessage(userId, payload.fromChatId, payload.messageId, {
          disable_notification: payload.silent,
        }),
      );
      sentDelta += 1;
    } catch (error) {
      failedDelta += 1;
      const reason = describeSendError(error);
      failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
    }
  }
  return {
    sentDelta,
    failedDelta,
    failureReasons,
    remainingUserIds: payload.remainingUserIds.slice(batch.length),
  };
}

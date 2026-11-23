import { GrammyError, type Api } from 'grammy';

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function buildIdRange(firstMessageId: number, lastMessageId: number): number[] {
  const ids: number[] = [];
  for (let id = firstMessageId; id <= lastMessageId; id += 1) {
    ids.push(id);
  }
  return ids;
}

export interface RetryOptions {
  maxRetries?: number;
  defaultBackoffMs?: number;
}

/**
 * Retries a Telegram API call when it fails with a 429 flood-control error, honoring the
 * `retry_after` value Telegram reports. Falls back to linear backoff if Telegram doesn't supply
 * a retry_after. Re-throws immediately for any other kind of error.
 */
export async function withFloodWaitRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 5, defaultBackoffMs = 1000 }: RetryOptions = {},
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      const isFloodWait = error instanceof GrammyError && error.error_code === 429;
      if (!isFloodWait || attempt >= maxRetries) {
        throw error;
      }
      attempt += 1;
      const retryAfterSeconds = error.parameters?.retry_after;
      const waitMs = retryAfterSeconds ? retryAfterSeconds * 1000 : defaultBackoffMs * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

export interface DeleteRangeOptions {
  chunkSize?: number;
}

export interface DeleteRangeResult {
  attemptedCount: number;
  chunkCount: number;
}

/** Thrown when a chunk fails partway through; `completedCount` ids were already sent for
 * deletion before it, so callers can tell the user how far it got. The API error is `cause`. */
export class DeleteMessagesError extends Error {
  constructor(
    readonly completedCount: number,
    options: { cause: unknown },
  ) {
    super(`Deleting messages failed after ${completedCount} were processed`, options);
    this.name = 'DeleteMessagesError';
  }
}

/**
 * Deletes an arbitrary (not necessarily contiguous) list of message ids from a chat, chunked to
 * Telegram's bulk-delete limit (100 ids per call), retrying any chunk that hits flood control.
 */
export async function deleteMessagesByIds(
  api: Pick<Api, 'deleteMessages'>,
  chatId: number,
  messageIds: number[],
  { chunkSize = 100 }: DeleteRangeOptions = {},
): Promise<DeleteRangeResult> {
  const chunks = chunk(messageIds, chunkSize);
  let completedCount = 0;
  for (const batch of chunks) {
    try {
      await withFloodWaitRetry(() => api.deleteMessages(chatId, batch));
    } catch (error) {
      throw new DeleteMessagesError(completedCount, { cause: error });
    }
    completedCount += batch.length;
  }
  return { attemptedCount: messageIds.length, chunkCount: chunks.length };
}

/**
 * Deletes every message id in [firstMessageId, lastMessageId] from a chat, chunked to Telegram's
 * bulk-delete limit (100 ids per call), retrying any chunk that hits flood control.
 */
export async function deleteMessageRange(
  api: Pick<Api, 'deleteMessages'>,
  chatId: number,
  firstMessageId: number,
  lastMessageId: number,
  options: DeleteRangeOptions = {},
): Promise<DeleteRangeResult> {
  return deleteMessagesByIds(api, chatId, buildIdRange(firstMessageId, lastMessageId), options);
}

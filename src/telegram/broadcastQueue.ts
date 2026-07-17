import type { Api } from 'grammy';

import { withFloodWaitRetry } from '@/telegram/deleteQueue.js';

export interface BroadcastResult {
  sent: number;
  failed: number;
}

/**
 * Sends `text` to every user id, one at a time, retrying individual sends on flood control.
 * A failed send (e.g. the user blocked the bot, or deleted their account) is expected and
 * non-fatal — it's counted, not thrown.
 */
export async function broadcastToUsers(
  api: Pick<Api, 'sendMessage'>,
  userIds: number[],
  text: string,
): Promise<BroadcastResult> {
  let sent = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      await withFloodWaitRetry(() => api.sendMessage(userId, text));
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}

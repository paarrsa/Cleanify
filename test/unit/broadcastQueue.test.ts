import { GrammyError } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { sendBroadcastBatch } from '@/telegram/broadcastQueue.js';

describe('sendBroadcastBatch', () => {
  it('sends only up to batchSize recipients, leaving the rest in remainingUserIds', async () => {
    const copyMessage = vi.fn().mockResolvedValue(true);
    const result = await sendBroadcastBatch(
      { copyMessage },
      { fromChatId: 100, messageId: 5, silent: false, remainingUserIds: [1, 2, 3, 4, 5] },
      2,
    );
    expect(copyMessage).toHaveBeenCalledTimes(2);
    expect(copyMessage).toHaveBeenNthCalledWith(1, 1, 100, 5, { disable_notification: false });
    expect(copyMessage).toHaveBeenNthCalledWith(2, 2, 100, 5, { disable_notification: false });
    expect(result).toEqual({
      sentDelta: 2,
      failedDelta: 0,
      failureReasons: {},
      remainingUserIds: [3, 4, 5],
    });
  });

  it('counts failed sends without aborting the rest of the batch, tallying the failure reason', async () => {
    const copyMessage = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(true);
    const result = await sendBroadcastBatch(
      { copyMessage },
      { fromChatId: 100, messageId: 5, silent: true, remainingUserIds: [1, 2, 3] },
      3,
    );
    expect(result).toEqual({
      sentDelta: 2,
      failedDelta: 1,
      failureReasons: { blocked: 1 },
      remainingUserIds: [],
    });
  });

  it('tallies multiple failures with the same reason together', async () => {
    const copyMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('chat not found'))
      .mockRejectedValueOnce(new Error('chat not found'))
      .mockRejectedValueOnce(new Error('bot was blocked'));
    const result = await sendBroadcastBatch(
      { copyMessage },
      { fromChatId: 100, messageId: 5, silent: false, remainingUserIds: [1, 2, 3] },
      3,
    );
    expect(result.failureReasons).toEqual({ 'chat not found': 2, 'bot was blocked': 1 });
  });

  it('tallies GrammyError failures by their Telegram-provided description', async () => {
    const grammyError = new GrammyError(
      'Call to sendMessage failed!',
      { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
      'copyMessage',
      {},
    );
    const copyMessage = vi.fn().mockRejectedValue(grammyError);
    const result = await sendBroadcastBatch(
      { copyMessage },
      { fromChatId: 100, messageId: 5, silent: false, remainingUserIds: [1] },
      10,
    );
    expect(result.failureReasons).toEqual({ 'Forbidden: bot was blocked by the user': 1 });
  });

  it('passes disable_notification through from the silent flag', async () => {
    const copyMessage = vi.fn().mockResolvedValue(true);
    await sendBroadcastBatch(
      { copyMessage },
      { fromChatId: 100, messageId: 5, silent: true, remainingUserIds: [1] },
      10,
    );
    expect(copyMessage).toHaveBeenCalledWith(1, 100, 5, { disable_notification: true });
  });

  it('returns an empty remainder when the batch covers everyone', async () => {
    const copyMessage = vi.fn().mockResolvedValue(true);
    const result = await sendBroadcastBatch(
      { copyMessage },
      { fromChatId: 100, messageId: 5, silent: false, remainingUserIds: [1, 2] },
      10,
    );
    expect(result.remainingUserIds).toEqual([]);
  });
});

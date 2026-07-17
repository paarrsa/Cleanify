import { GrammyError } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import {
  buildIdRange,
  chunk,
  deleteMessageRange,
  withFloodWaitRetry,
} from '@/telegram/deleteQueue.js';

function makeFloodError(retryAfter: number): GrammyError {
  return new GrammyError(
    'Too Many Requests',
    {
      ok: false,
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: retryAfter },
    },
    'deleteMessages',
    {},
  );
}

describe('chunk', () => {
  it('splits into groups of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunk([], 100)).toEqual([]);
  });
});

describe('buildIdRange', () => {
  it('is inclusive of both endpoints', () => {
    expect(buildIdRange(5, 8)).toEqual([5, 6, 7, 8]);
  });

  it('handles a single-id range', () => {
    expect(buildIdRange(5, 5)).toEqual([5]);
  });
});

describe('withFloodWaitRetry', () => {
  it('returns the result on success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withFloodWaitRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('retries on a 429 and eventually succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(makeFloodError(0)).mockResolvedValueOnce('ok');
    await expect(withFloodWaitRetry(fn, { defaultBackoffMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-429 errors immediately', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(withFloodWaitRetry(fn)).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('gives up after maxRetries', async () => {
    const fn = vi.fn().mockRejectedValue(makeFloodError(0));
    await expect(
      withFloodWaitRetry(fn, { maxRetries: 2, defaultBackoffMs: 0 }),
    ).rejects.toBeInstanceOf(GrammyError);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('deleteMessageRange', () => {
  it('chunks calls to deleteMessages by the configured size', async () => {
    const deleteMessages = vi.fn().mockResolvedValue(true);
    const result = await deleteMessageRange({ deleteMessages }, 123, 1, 250, { chunkSize: 100 });
    expect(deleteMessages).toHaveBeenCalledTimes(3);
    expect(deleteMessages).toHaveBeenNthCalledWith(
      1,
      123,
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
    expect(result).toEqual({ attemptedCount: 250, chunkCount: 3 });
  });
});

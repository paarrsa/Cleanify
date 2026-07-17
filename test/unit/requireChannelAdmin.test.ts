import { GrammyError } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { checkChannelAdmin } from '@/bot/middleware/requireChannelAdmin.js';

function makeApiError(): GrammyError {
  return new GrammyError(
    'Bad Request: member list is inaccessible',
    { ok: false, error_code: 400, description: 'Bad Request: member list is inaccessible' },
    'getChatMember',
    {},
  );
}

describe('checkChannelAdmin', () => {
  it('allows a creator', async () => {
    const getChatMember = vi.fn().mockResolvedValue({ status: 'creator' });
    await expect(checkChannelAdmin({ getChatMember }, 1, 2)).resolves.toEqual({ allowed: true });
  });

  it('allows an administrator', async () => {
    const getChatMember = vi.fn().mockResolvedValue({ status: 'administrator' });
    await expect(checkChannelAdmin({ getChatMember }, 1, 2)).resolves.toEqual({ allowed: true });
  });

  it('denies a regular member', async () => {
    const getChatMember = vi.fn().mockResolvedValue({ status: 'member' });
    await expect(checkChannelAdmin({ getChatMember }, 1, 2)).resolves.toEqual({
      allowed: false,
      reason: 'user_not_admin',
    });
  });

  it('reports bot_lacks_access when the API call itself fails', async () => {
    const getChatMember = vi.fn().mockRejectedValue(makeApiError());
    await expect(checkChannelAdmin({ getChatMember }, 1, 2)).resolves.toEqual({
      allowed: false,
      reason: 'bot_lacks_access',
    });
  });

  it('rethrows unexpected errors', async () => {
    const getChatMember = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(checkChannelAdmin({ getChatMember }, 1, 2)).rejects.toThrow('network down');
  });
});

import { GrammyError } from 'grammy';
import { describe, expect, it, vi } from 'vitest';

import { checkChannelAdmin } from '@/bot/middleware/requireChannelAdmin.js';

const CHANNEL = 1;
const USER = 2;
const BOT = 3;

function makeApiError(): GrammyError {
  return new GrammyError(
    'Bad Request: member list is inaccessible',
    { ok: false, error_code: 400, description: 'Bad Request: member list is inaccessible' },
    'getChatMember',
    {},
  );
}

const botCanDelete = { status: 'administrator', can_delete_messages: true };

/** getChatMember stub answering for the bot and the user separately. */
function members(bot: unknown, user: unknown) {
  return vi.fn((_chat: number, id: number) =>
    Promise.resolve(id === BOT ? bot : user),
  ) as unknown as Parameters<typeof checkChannelAdmin>[0]['getChatMember'];
}

describe('checkChannelAdmin', () => {
  it('allows a creator', async () => {
    const getChatMember = members(botCanDelete, { status: 'creator' });
    await expect(checkChannelAdmin({ getChatMember }, CHANNEL, USER, BOT)).resolves.toEqual({
      allowed: true,
    });
  });

  it('allows an administrator', async () => {
    const getChatMember = members(botCanDelete, { status: 'administrator' });
    await expect(checkChannelAdmin({ getChatMember }, CHANNEL, USER, BOT)).resolves.toEqual({
      allowed: true,
    });
  });

  it('denies a regular member', async () => {
    const getChatMember = members(botCanDelete, { status: 'member' });
    await expect(checkChannelAdmin({ getChatMember }, CHANNEL, USER, BOT)).resolves.toEqual({
      allowed: false,
      reason: 'user_not_admin',
    });
  });

  it('reports bot_cannot_delete when the bot is an admin without Delete messages', async () => {
    const getChatMember = members(
      { status: 'administrator', can_delete_messages: false },
      { status: 'creator' },
    );
    await expect(checkChannelAdmin({ getChatMember }, CHANNEL, USER, BOT)).resolves.toEqual({
      allowed: false,
      reason: 'bot_cannot_delete',
    });
  });

  it('reports bot_lacks_access when the bot is not an admin', async () => {
    const getChatMember = members({ status: 'left' }, { status: 'creator' });
    await expect(checkChannelAdmin({ getChatMember }, CHANNEL, USER, BOT)).resolves.toEqual({
      allowed: false,
      reason: 'bot_lacks_access',
    });
  });

  it('reports bot_lacks_access when the API call itself fails', async () => {
    const getChatMember = vi.fn().mockRejectedValue(makeApiError());
    await expect(checkChannelAdmin({ getChatMember }, CHANNEL, USER, BOT)).resolves.toEqual({
      allowed: false,
      reason: 'bot_lacks_access',
    });
  });

  it('rethrows unexpected errors', async () => {
    const getChatMember = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(checkChannelAdmin({ getChatMember }, CHANNEL, USER, BOT)).rejects.toThrow(
      'network down',
    );
  });
});

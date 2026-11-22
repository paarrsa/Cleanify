import { describe, expect, it, vi } from 'vitest';

vi.mock('@/logging/logger.js', () => ({ logger: { warn: vi.fn() } }));

const { checkChannelMembership } = await import('@/bot/middleware/forceJoin.js');

describe('checkChannelMembership', () => {
  it.each(['creator', 'administrator', 'member'])('treats %s as a member', async (status) => {
    const getChatMember = vi.fn().mockResolvedValue({ status });
    await expect(checkChannelMembership({ getChatMember }, '@chan', 1)).resolves.toBe('member');
  });

  it.each(['left', 'kicked'])('treats %s as not a member', async (status) => {
    const getChatMember = vi.fn().mockResolvedValue({ status });
    await expect(checkChannelMembership({ getChatMember }, '@chan', 1)).resolves.toBe('not_member');
  });

  it('uses is_member for restricted users', async () => {
    const inside = vi.fn().mockResolvedValue({ status: 'restricted', is_member: true });
    const outside = vi.fn().mockResolvedValue({ status: 'restricted', is_member: false });
    await expect(checkChannelMembership({ getChatMember: inside }, '@c', 1)).resolves.toBe(
      'member',
    );
    await expect(checkChannelMembership({ getChatMember: outside }, '@c', 1)).resolves.toBe(
      'not_member',
    );
  });

  it('returns unknown (fails open) when the lookup errors', async () => {
    const getChatMember = vi.fn().mockRejectedValue(new Error('member list is inaccessible'));
    await expect(checkChannelMembership({ getChatMember }, '@chan', 1)).resolves.toBe('unknown');
  });
});

import { describe, expect, it, vi } from 'vitest';

import { broadcastToUsers } from '@/telegram/broadcastQueue.js';

describe('broadcastToUsers', () => {
  it('counts successful sends', async () => {
    const sendMessage = vi.fn().mockResolvedValue(true);
    const result = await broadcastToUsers({ sendMessage }, [1, 2, 3], 'hi');
    expect(result).toEqual({ sent: 3, failed: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it('counts failed sends without aborting the rest', async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValueOnce(true);
    const result = await broadcastToUsers({ sendMessage }, [1, 2, 3], 'hi');
    expect(result).toEqual({ sent: 2, failed: 1 });
  });
});

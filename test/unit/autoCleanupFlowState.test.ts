import { describe, expect, it } from 'vitest';

import {
  chooseSingleChannel,
  initialAutoCleanupFlowSession,
  parseDays,
  resetAutoCleanupFlow,
  selectChannel,
  startChoosingChannel,
} from '@/bot/state/autoCleanupFlowState.js';

describe('autoCleanupFlowState', () => {
  it('starts idle', () => {
    expect(initialAutoCleanupFlowSession).toEqual({ state: 'idle' });
  });

  it('chooseSingleChannel jumps straight to awaiting_days', () => {
    expect(chooseSingleChannel(7)).toEqual({ state: 'awaiting_days', channelId: 7 });
  });

  it('selectChannel only succeeds from choosing_channel', () => {
    expect(selectChannel({ state: 'idle' }, 7)).toBeUndefined();
    expect(selectChannel(startChoosingChannel(), 7)).toEqual({
      state: 'awaiting_days',
      channelId: 7,
    });
  });

  it('resetAutoCleanupFlow returns to idle', () => {
    expect(resetAutoCleanupFlow()).toEqual({ state: 'idle' });
  });

  describe('parseDays', () => {
    it('accepts a positive integer', () => {
      expect(parseDays('30')).toBe(30);
      expect(parseDays(' 7 ')).toBe(7);
    });

    it('rejects zero, negative, decimal, and non-numeric input', () => {
      expect(parseDays('0')).toBeUndefined();
      expect(parseDays('-5')).toBeUndefined();
      expect(parseDays('3.5')).toBeUndefined();
      expect(parseDays('thirty')).toBeUndefined();
      expect(parseDays('')).toBeUndefined();
    });
  });
});

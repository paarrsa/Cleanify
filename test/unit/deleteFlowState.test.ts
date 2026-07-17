import { describe, expect, it } from 'vitest';

import {
  confirmDeleteFlow,
  estimateMessageCount,
  initialDeleteFlowSession,
  receiveFirstMessage,
  receiveSecondMessage,
  resetDeleteFlow,
  startDeleteFlow,
} from '@/bot/state/deleteFlowState.js';

describe('deleteFlowState', () => {
  it('starts idle', () => {
    expect(initialDeleteFlowSession).toEqual({ state: 'idle' });
  });

  it('startDeleteFlow moves to awaiting_first', () => {
    expect(startDeleteFlow()).toEqual({ state: 'awaiting_first' });
  });

  it('receiveFirstMessage rejects when not awaiting_first', () => {
    const result = receiveFirstMessage({ state: 'idle' }, { channelId: 1, messageId: 10 });
    expect(result).toEqual({ ok: false, error: 'wrong_state' });
  });

  it('receiveFirstMessage records channel and first message id', () => {
    const result = receiveFirstMessage(startDeleteFlow(), {
      channelId: 42,
      channelTitle: 'My Channel',
      messageId: 100,
    });
    expect(result).toEqual({
      ok: true,
      session: {
        state: 'awaiting_last',
        channelId: 42,
        channelTitle: 'My Channel',
        firstMessageId: 100,
      },
    });
  });

  it('receiveSecondMessage rejects a different channel', () => {
    const afterFirst = receiveFirstMessage(startDeleteFlow(), { channelId: 42, messageId: 100 });
    if (!afterFirst.ok) throw new Error('setup failed');
    const result = receiveSecondMessage(afterFirst.session, { channelId: 99, messageId: 200 });
    expect(result).toEqual({ ok: false, error: 'different_channel' });
  });

  it('receiveSecondMessage rejects an id before the first message', () => {
    const afterFirst = receiveFirstMessage(startDeleteFlow(), { channelId: 42, messageId: 100 });
    if (!afterFirst.ok) throw new Error('setup failed');
    const result = receiveSecondMessage(afterFirst.session, { channelId: 42, messageId: 50 });
    expect(result).toEqual({ ok: false, error: 'out_of_order' });
  });

  it('receiveSecondMessage accepts an equal id (single-message range)', () => {
    const afterFirst = receiveFirstMessage(startDeleteFlow(), { channelId: 42, messageId: 100 });
    if (!afterFirst.ok) throw new Error('setup failed');
    const result = receiveSecondMessage(afterFirst.session, { channelId: 42, messageId: 100 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.state).toBe('confirming');
      expect(result.session.lastMessageId).toBe(100);
    }
  });

  it('confirmDeleteFlow only succeeds from confirming', () => {
    expect(confirmDeleteFlow({ state: 'awaiting_last' })).toEqual({
      ok: false,
      error: 'wrong_state',
    });
    const result = confirmDeleteFlow({
      state: 'confirming',
      channelId: 1,
      firstMessageId: 1,
      lastMessageId: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.state).toBe('running');
    }
  });

  it('resetDeleteFlow returns to idle', () => {
    expect(resetDeleteFlow()).toEqual({ state: 'idle' });
  });

  it('estimateMessageCount is inclusive of both ends', () => {
    expect(estimateMessageCount(100, 100)).toBe(1);
    expect(estimateMessageCount(100, 109)).toBe(10);
  });
});

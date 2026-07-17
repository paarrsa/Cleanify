import { describe, expect, it } from 'vitest';

import {
  initialBroadcastFlowSession,
  receiveBroadcastText,
  resetBroadcastFlow,
  startBroadcastFlow,
} from '@/bot/state/broadcastFlowState.js';

describe('broadcastFlowState', () => {
  it('starts idle', () => {
    expect(initialBroadcastFlowSession).toEqual({ state: 'idle' });
  });

  it('startBroadcastFlow moves to awaiting_text', () => {
    expect(startBroadcastFlow()).toEqual({ state: 'awaiting_text' });
  });

  it('receiveBroadcastText only succeeds from awaiting_text', () => {
    expect(receiveBroadcastText({ state: 'idle' }, 'hello')).toBeUndefined();
  });

  it('receiveBroadcastText records the text and moves to confirming', () => {
    expect(receiveBroadcastText(startBroadcastFlow(), 'hello everyone')).toEqual({
      state: 'confirming',
      text: 'hello everyone',
    });
  });

  it('resetBroadcastFlow returns to idle', () => {
    expect(resetBroadcastFlow()).toEqual({ state: 'idle' });
  });
});

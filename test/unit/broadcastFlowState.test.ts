import { describe, expect, it } from 'vitest';

import {
  initialBroadcastFlowSession,
  receiveBroadcastContent,
  resetBroadcastFlow,
  setBroadcastAudience,
  startBroadcastFlow,
  toggleBroadcastSilent,
} from '@/bot/state/broadcastFlowState.js';

describe('broadcastFlowState', () => {
  it('starts idle', () => {
    expect(initialBroadcastFlowSession).toEqual({ state: 'idle' });
  });

  it('startBroadcastFlow moves to awaiting_content', () => {
    expect(startBroadcastFlow()).toEqual({ state: 'awaiting_content' });
  });

  it('receiveBroadcastContent only succeeds from awaiting_content', () => {
    expect(
      receiveBroadcastContent({ state: 'idle' }, { fromChatId: 1, messageId: 2 }),
    ).toBeUndefined();
  });

  it('receiveBroadcastContent records the content, defaulting to all users and notifications on', () => {
    expect(receiveBroadcastContent(startBroadcastFlow(), { fromChatId: 1, messageId: 2 })).toEqual({
      state: 'configuring',
      fromChatId: 1,
      messageId: 2,
      audience: 'all',
      silent: false,
    });
  });

  it('setBroadcastAudience only succeeds while configuring', () => {
    expect(setBroadcastAudience({ state: 'awaiting_content' }, 'en')).toBeUndefined();
  });

  it('setBroadcastAudience updates the audience', () => {
    const configuring = receiveBroadcastContent(startBroadcastFlow(), {
      fromChatId: 1,
      messageId: 2,
    })!;
    expect(setBroadcastAudience(configuring, 'fa')).toEqual({ ...configuring, audience: 'fa' });
  });

  it('toggleBroadcastSilent flips silent and only succeeds while configuring', () => {
    expect(toggleBroadcastSilent({ state: 'idle' })).toBeUndefined();

    const configuring = receiveBroadcastContent(startBroadcastFlow(), {
      fromChatId: 1,
      messageId: 2,
    })!;
    const toggled = toggleBroadcastSilent(configuring)!;
    expect(toggled.silent).toBe(true);
    expect(toggleBroadcastSilent(toggled)!.silent).toBe(false);
  });

  it('resetBroadcastFlow returns to idle', () => {
    expect(resetBroadcastFlow()).toEqual({ state: 'idle' });
  });
});

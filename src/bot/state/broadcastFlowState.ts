import type { BroadcastAudience } from '@/telegram/broadcastQueue.js';

export type { BroadcastAudience };

export type BroadcastFlowState = 'idle' | 'awaiting_content' | 'configuring';

export interface BroadcastFlowSession {
  state: BroadcastFlowState;
  fromChatId?: number;
  messageId?: number;
  audience?: BroadcastAudience;
  silent?: boolean;
}

export const initialBroadcastFlowSession: BroadcastFlowSession = { state: 'idle' };

export function startBroadcastFlow(): BroadcastFlowSession {
  return { state: 'awaiting_content' };
}

/** Returns undefined if called outside of awaiting_content. Defaults to the "all users" audience
 * and notifications on — both adjustable on the options screen before confirming. */
export function receiveBroadcastContent(
  session: BroadcastFlowSession,
  content: { fromChatId: number; messageId: number },
): BroadcastFlowSession | undefined {
  if (session.state !== 'awaiting_content') {
    return undefined;
  }
  return {
    state: 'configuring',
    fromChatId: content.fromChatId,
    messageId: content.messageId,
    audience: 'all',
    silent: false,
  };
}

export function setBroadcastAudience(
  session: BroadcastFlowSession,
  audience: BroadcastAudience,
): BroadcastFlowSession | undefined {
  if (session.state !== 'configuring') {
    return undefined;
  }
  return { ...session, audience };
}

export function toggleBroadcastSilent(
  session: BroadcastFlowSession,
): BroadcastFlowSession | undefined {
  if (session.state !== 'configuring') {
    return undefined;
  }
  return { ...session, silent: !session.silent };
}

export function resetBroadcastFlow(): BroadcastFlowSession {
  return { ...initialBroadcastFlowSession };
}

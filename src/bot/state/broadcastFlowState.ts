export type BroadcastFlowState = 'idle' | 'awaiting_text' | 'confirming';

export interface BroadcastFlowSession {
  state: BroadcastFlowState;
  text?: string;
}

export const initialBroadcastFlowSession: BroadcastFlowSession = { state: 'idle' };

export function startBroadcastFlow(): BroadcastFlowSession {
  return { state: 'awaiting_text' };
}

/** Returns undefined (rather than a result union, since this flow has only one failure mode) if
 * called outside of awaiting_text. */
export function receiveBroadcastText(
  session: BroadcastFlowSession,
  text: string,
): BroadcastFlowSession | undefined {
  if (session.state !== 'awaiting_text') {
    return undefined;
  }
  return { state: 'confirming', text };
}

export function resetBroadcastFlow(): BroadcastFlowSession {
  return { ...initialBroadcastFlowSession };
}

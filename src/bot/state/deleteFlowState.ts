export type DeleteFlowState =
  'idle' | 'awaiting_first' | 'awaiting_last' | 'confirming' | 'running';

export interface DeleteFlowSession {
  state: DeleteFlowState;
  channelId?: number;
  channelTitle?: string | undefined;
  firstMessageId?: number;
  lastMessageId?: number;
  /** Set once a `jobs` row is created for this flow (in the `confirming` state onward), so the
   * confirm handler can update the same job's status rather than creating a second one. */
  jobId?: number;
}

export const initialDeleteFlowSession: DeleteFlowSession = { state: 'idle' };

export type TransitionError = 'wrong_state' | 'different_channel' | 'out_of_order';

export type TransitionResult =
  { ok: true; session: DeleteFlowSession } | { ok: false; error: TransitionError };

/** Begins the delete-range flow, discarding any in-progress state. */
export function startDeleteFlow(): DeleteFlowSession {
  return { state: 'awaiting_first' };
}

/** Records the first (start-of-range) forwarded message and the channel it came from. */
export function receiveFirstMessage(
  session: DeleteFlowSession,
  input: { channelId: number; channelTitle?: string | undefined; messageId: number },
): TransitionResult {
  if (session.state !== 'awaiting_first') {
    return { ok: false, error: 'wrong_state' };
  }
  return {
    ok: true,
    session: {
      state: 'awaiting_last',
      channelId: input.channelId,
      channelTitle: input.channelTitle,
      firstMessageId: input.messageId,
    },
  };
}

/** Records the second (end-of-range) forwarded message; must be from the same channel and >= first. */
export function receiveSecondMessage(
  session: DeleteFlowSession,
  input: { channelId: number; messageId: number },
): TransitionResult {
  if (session.state !== 'awaiting_last') {
    return { ok: false, error: 'wrong_state' };
  }
  if (session.channelId !== input.channelId) {
    return { ok: false, error: 'different_channel' };
  }
  if (session.firstMessageId === undefined || input.messageId < session.firstMessageId) {
    return { ok: false, error: 'out_of_order' };
  }
  return {
    ok: true,
    session: { ...session, state: 'confirming', lastMessageId: input.messageId },
  };
}

/** Moves from "confirming" to "running" once the user taps the confirm button. */
export function confirmDeleteFlow(session: DeleteFlowSession): TransitionResult {
  if (session.state !== 'confirming') {
    return { ok: false, error: 'wrong_state' };
  }
  return { ok: true, session: { ...session, state: 'running' } };
}

/** Resets to idle — used for both explicit cancellation and after a run completes. */
export function resetDeleteFlow(): DeleteFlowSession {
  return { ...initialDeleteFlowSession };
}

/** Estimated message count for a range. Labeled as an estimate: some ids in range may not exist
 * (service messages, prior deletions), so this is an upper bound, not an exact count. */
export function estimateMessageCount(firstMessageId: number, lastMessageId: number): number {
  return lastMessageId - firstMessageId + 1;
}

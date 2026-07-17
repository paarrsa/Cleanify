export type AutoCleanupFlowState = 'idle' | 'choosing_channel' | 'awaiting_days';

export interface AutoCleanupFlowSession {
  state: AutoCleanupFlowState;
  /** Internal (Drizzle) channel id, not the Telegram chat id. */
  channelId?: number;
}

export const initialAutoCleanupFlowSession: AutoCleanupFlowSession = { state: 'idle' };

export function startChoosingChannel(): AutoCleanupFlowSession {
  return { state: 'choosing_channel' };
}

export function chooseSingleChannel(channelId: number): AutoCleanupFlowSession {
  return { state: 'awaiting_days', channelId };
}

export function selectChannel(
  session: AutoCleanupFlowSession,
  channelId: number,
): AutoCleanupFlowSession | undefined {
  if (session.state !== 'choosing_channel') {
    return undefined;
  }
  return { state: 'awaiting_days', channelId };
}

export function resetAutoCleanupFlow(): AutoCleanupFlowSession {
  return { ...initialAutoCleanupFlowSession };
}

/** Parses a user-supplied day count; must be a positive integer. */
export function parseDays(text: string): number | undefined {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) {
    return undefined;
  }
  const days = Number.parseInt(trimmed, 10);
  return days > 0 ? days : undefined;
}

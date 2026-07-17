import { and, eq, inArray, lt } from 'drizzle-orm';

import type { Database } from '@/db/client.js';
import { messageLog } from '@/db/schema.js';

export async function recordMessageLogEntry(
  db: Database,
  input: { channelId: number; messageId: number; postedAt: Date },
) {
  await db.insert(messageLog).values(input).onConflictDoNothing();
}

export async function getOldMessageIds(
  db: Database,
  channelId: number,
  olderThan: Date,
): Promise<number[]> {
  const rows = await db
    .select({ messageId: messageLog.messageId })
    .from(messageLog)
    .where(and(eq(messageLog.channelId, channelId), lt(messageLog.postedAt, olderThan)));
  return rows.map((row) => row.messageId);
}

export async function deleteMessageLogEntries(
  db: Database,
  channelId: number,
  messageIds: number[],
) {
  if (messageIds.length === 0) return;
  await db
    .delete(messageLog)
    .where(and(eq(messageLog.channelId, channelId), inArray(messageLog.messageId, messageIds)));
}

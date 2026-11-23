import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';

import type { Database } from '@/db/client.js';
import { channels, messageLog } from '@/db/schema.js';

export async function recordMessageLogEntry(
  db: Database,
  input: { channelId: number; messageId: number; postedAt: Date },
) {
  await db.insert(messageLog).values(input).onConflictDoNothing();
}

/** Oldest-first and capped at `limit`, so a big backlog is worked through over several cron ticks
 * instead of loading (and deleting) every eligible message in one go. */
export async function getOldMessageIds(
  db: Database,
  channelId: number,
  olderThan: Date,
  limit = 10_000,
): Promise<number[]> {
  const rows = await db
    .select({ messageId: messageLog.messageId })
    .from(messageLog)
    .where(and(eq(messageLog.channelId, channelId), lt(messageLog.postedAt, olderThan)))
    .orderBy(asc(messageLog.postedAt))
    .limit(limit);
  return rows.map((row) => row.messageId);
}

/**
 * Deletes up to `batchSize` log rows belonging to channels that don't have auto-cleanup enabled —
 * nothing ever reads those rows. Batched so that a large backlog is drained over several cron
 * ticks rather than in one long, lock-heavy DELETE. Returns how many rows were removed.
 */
export async function pruneUnusedMessageLog(db: Database, batchSize = 50_000): Promise<number> {
  const unused = db
    .select({ channelId: messageLog.channelId, messageId: messageLog.messageId })
    .from(messageLog)
    .innerJoin(channels, eq(channels.id, messageLog.channelId))
    .where(eq(channels.autoCleanupEnabled, false))
    .limit(batchSize);
  const deleted = await db
    .delete(messageLog)
    .where(sql`(${messageLog.channelId}, ${messageLog.messageId}) in (${unused})`)
    .returning({ channelId: messageLog.channelId });
  return deleted.length;
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

import { desc, eq, type InferInsertModel } from 'drizzle-orm';

import type { Database } from '@/db/client.js';
import { auditLog, channels } from '@/db/schema.js';

export type NewAuditLogEntry = InferInsertModel<typeof auditLog>;

/** Records a completed action. `summary` must only contain counts/ranges/ids — never message content. */
export async function recordAuditLogEntry(db: Database, input: NewAuditLogEntry) {
  await db.insert(auditLog).values(input);
}

export async function getRecentAuditLogForUser(db: Database, userId: number, limit = 10) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.actorUserId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function getRecentAuditLogWithChannelForUser(
  db: Database,
  userId: number,
  limit = 10,
) {
  return db
    .select({ entry: auditLog, channelTitle: channels.title, channelUsername: channels.username })
    .from(auditLog)
    .leftJoin(channels, eq(auditLog.channelId, channels.id))
    .where(eq(auditLog.actorUserId, userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

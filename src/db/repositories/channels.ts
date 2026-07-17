import { eq } from 'drizzle-orm';

import type { Database } from '@/db/client.js';
import { channelMembers, channels } from '@/db/schema.js';

export async function upsertChannel(
  db: Database,
  input: { telegramChatId: number; title?: string | null; username?: string | null },
) {
  const [channel] = await db
    .insert(channels)
    .values({
      telegramChatId: input.telegramChatId,
      title: input.title ?? null,
      username: input.username ?? null,
    })
    .onConflictDoUpdate({
      target: channels.telegramChatId,
      set: { title: input.title ?? null, username: input.username ?? null },
    })
    .returning();
  if (!channel) {
    throw new Error('Failed to upsert channel');
  }
  return channel;
}

export async function addChannelMember(
  db: Database,
  input: { channelId: number; userId: number; role?: 'owner' | 'admin' },
) {
  await db
    .insert(channelMembers)
    .values({ channelId: input.channelId, userId: input.userId, role: input.role ?? 'admin' })
    .onConflictDoNothing();
}

export async function getChannelsForUser(db: Database, userId: number) {
  return db
    .select({ channel: channels, role: channelMembers.role })
    .from(channelMembers)
    .innerJoin(channels, eq(channelMembers.channelId, channels.id))
    .where(eq(channelMembers.userId, userId));
}

export async function getChannelByTelegramId(db: Database, telegramChatId: number) {
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.telegramChatId, telegramChatId))
    .limit(1);
  return channel;
}

export async function setAutoCleanup(
  db: Database,
  channelId: number,
  input: { enabled: boolean; days?: number | null },
) {
  await db
    .update(channels)
    .set({ autoCleanupEnabled: input.enabled, autoCleanupDays: input.days ?? null })
    .where(eq(channels.id, channelId));
}

export async function disableAutoCleanupForUser(db: Database, userId: number) {
  const rows = await getChannelsForUser(db, userId);
  for (const row of rows) {
    await setAutoCleanup(db, row.channel.id, { enabled: false, days: null });
  }
}

export async function getChannelsWithAutoCleanupEnabled(db: Database) {
  return db.select().from(channels).where(eq(channels.autoCleanupEnabled, true));
}

/** Any member of the channel, preferring the owner — used to attribute system-triggered
 * (scheduled) actions to a user for audit-log purposes, since there's no human actor to record. */
export async function getAnyChannelMember(db: Database, channelId: number) {
  const rows = await db
    .select()
    .from(channelMembers)
    .where(eq(channelMembers.channelId, channelId));
  return rows.find((row) => row.role === 'owner') ?? rows[0];
}

import { eq } from 'drizzle-orm';

import type { Database } from '@/db/client.js';
import { users } from '@/db/schema.js';
import type { Locale } from '@/i18n/index.js';

/** Inserts a new user or, for an existing one, refreshes their cached username only (never
 * touches language/other preferences — mirrors the legacy bot's upsert-on-every-message behavior). */
export async function upsertUser(db: Database, input: { id: number; username?: string | null }) {
  const [user] = await db
    .insert(users)
    .values({ id: input.id, username: input.username ?? null })
    .onConflictDoUpdate({
      target: users.id,
      set: { username: input.username ?? null, updatedAt: new Date() },
    })
    .returning();
  if (!user) {
    throw new Error('Failed to upsert user');
  }
  return user;
}

export async function getUser(db: Database, id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export async function setUserLanguage(db: Database, id: number, language: Locale) {
  await db.update(users).set({ language, updatedAt: new Date() }).where(eq(users.id, id));
}

export async function getAllUserIds(db: Database): Promise<number[]> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.map((row) => row.id);
}

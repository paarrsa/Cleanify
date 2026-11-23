import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '@/db/client.js';
import { getOldMessageIds, pruneUnusedMessageLog } from '@/db/repositories/messageLog.js';
import * as schema from '@/db/schema.js';

let db: Database;

async function seed() {
  const [on, off] = await db
    .insert(schema.channels)
    .values([
      { telegramChatId: -1001, autoCleanupEnabled: true, autoCleanupDays: 1 },
      { telegramChatId: -1002, autoCleanupEnabled: false },
    ])
    .returning();
  const rows = (channelId: number) =>
    Array.from({ length: 5 }, (_, i) => ({
      channelId,
      messageId: i + 1,
      postedAt: new Date(Date.UTC(2020, 0, i + 1)),
    }));
  await db.insert(schema.messageLog).values([...rows(on!.id), ...rows(off!.id)]);
  return { on: on!, off: off! };
}

async function countFor(channelId: number) {
  const rows = await db.select().from(schema.messageLog);
  return rows.filter((row) => row.channelId === channelId).length;
}

beforeEach(async () => {
  const pg = drizzle({ client: new PGlite(), schema });
  await migrate(pg, { migrationsFolder: 'src/db/migrations' });
  db = pg as unknown as Database;
});

describe('pruneUnusedMessageLog', () => {
  it('removes rows only for channels without auto-cleanup, in batches', async () => {
    const { on, off } = await seed();

    await expect(pruneUnusedMessageLog(db, 3)).resolves.toBe(3);
    expect(await countFor(off.id)).toBe(2);

    await expect(pruneUnusedMessageLog(db, 3)).resolves.toBe(2);
    await expect(pruneUnusedMessageLog(db, 3)).resolves.toBe(0);
    expect(await countFor(off.id)).toBe(0);
    expect(await countFor(on.id)).toBe(5);
  });
});

describe('getOldMessageIds', () => {
  it('returns the oldest eligible messages first, capped at the limit', async () => {
    const { on } = await seed();
    await expect(getOldMessageIds(db, on.id, new Date(), 2)).resolves.toEqual([1, 2]);
  });
});

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { getEnv } from '@/config/env.js';
import * as schema from '@/db/schema.js';

let cachedSql: Sql | undefined;
let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Returns a Drizzle client over a pooled TCP connection. Cleanify runs as a single long-lived
 * process (see src/index.ts), not short-lived serverless invocations, so a connection pool that
 * stays open and gets reused across requests is the right shape here — it avoids paying an HTTP
 * round-trip per query the way the old Netlify-oriented HTTP driver did.
 */
export function getDb() {
  if (!cachedDb) {
    cachedSql = postgres(getEnv().DATABASE_URL);
    cachedDb = drizzle({ client: cachedSql, schema });
  }
  return cachedDb;
}

/** Closes the pooled connection — call during graceful shutdown so the process can exit cleanly
 * instead of being held open by idle connections. */
export async function closeDb() {
  await cachedSql?.end();
  cachedSql = undefined;
  cachedDb = undefined;
}

export type Database = ReturnType<typeof getDb>;

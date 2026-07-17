import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { getEnv } from '@/config/env.js';
import * as schema from '@/db/schema.js';

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Returns a Drizzle client over Neon's HTTP driver. One fetch per query, no pooled TCP
 * connection to manage across invocations — the right shape for short-lived functions.
 */
export function getDb() {
  if (!cachedDb) {
    const sql = neon(getEnv().DATABASE_URL);
    cachedDb = drizzle({ client: sql, schema });
  }
  return cachedDb;
}

export type Database = ReturnType<typeof getDb>;

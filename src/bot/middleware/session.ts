import { eq } from 'drizzle-orm';
import { session, type StorageAdapter } from 'grammy';

import type { BotContext } from '@/bot/context.js';
import {
  initialAutoCleanupFlowSession,
  type AutoCleanupFlowSession,
} from '@/bot/state/autoCleanupFlowState.js';
import {
  initialBroadcastFlowSession,
  type BroadcastFlowSession,
} from '@/bot/state/broadcastFlowState.js';
import { initialDeleteFlowSession, type DeleteFlowSession } from '@/bot/state/deleteFlowState.js';
import type { Database } from '@/db/client.js';
import { botSessions } from '@/db/schema.js';

export interface SessionData {
  deleteFlow: DeleteFlowSession;
  broadcast: BroadcastFlowSession;
  autoCleanup: AutoCleanupFlowSession;
}

function createNeonSessionStorage(db: Database): StorageAdapter<SessionData> {
  return {
    async read(key) {
      const [row] = await db.select().from(botSessions).where(eq(botSessions.key, key)).limit(1);
      return row?.value as SessionData | undefined;
    },
    async write(key, value) {
      await db
        .insert(botSessions)
        .values({ key, value, updatedAt: new Date() })
        .onConflictDoUpdate({ target: botSessions.key, set: { value, updatedAt: new Date() } });
    },
    async delete(key) {
      await db.delete(botSessions).where(eq(botSessions.key, key));
    },
  };
}

/** grammY session middleware, persisted in Neon (bot_sessions table) instead of in-memory, since
 * a Netlify Function instance doesn't persist state between invocations. */
export function createSessionMiddleware(db: Database) {
  return session<SessionData, BotContext>({
    initial: (): SessionData => ({
      deleteFlow: initialDeleteFlowSession,
      broadcast: initialBroadcastFlowSession,
      autoCleanup: initialAutoCleanupFlowSession,
    }),
    storage: createNeonSessionStorage(db),
  });
}

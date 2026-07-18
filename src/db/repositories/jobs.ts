import { and, asc, eq, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

import type { Database } from '@/db/client.js';
import { jobs } from '@/db/schema.js';

export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;

export async function createJob(db: Database, input: NewJob): Promise<Job> {
  const [job] = await db.insert(jobs).values(input).returning();
  if (!job) {
    throw new Error('Failed to create job');
  }
  return job;
}

export async function updateJobStatus(
  db: Database,
  id: number,
  status: Job['status'],
  completedAt?: Date,
) {
  await db
    .update(jobs)
    .set({ status, completedAt: completedAt ?? null })
    .where(eq(jobs.id, id));
}

export async function getJob(db: Database, id: number) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return job;
}

export async function updateJobPayload(db: Database, id: number, payload: Job['payload']) {
  await db.update(jobs).set({ payload }).where(eq(jobs.id, id));
}

/** The longest-queued job of a given type/status — used to pick up the next batch of a
 * resumable job (e.g. broadcast) on each tick of an external scheduler. */
export async function getOldestJobByTypeAndStatus(
  db: Database,
  type: Job['type'],
  status: Job['status'],
) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.type, type), eq(jobs.status, status)))
    .orderBy(asc(jobs.createdAt))
    .limit(1);
  return job;
}

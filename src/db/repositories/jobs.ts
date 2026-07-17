import { eq, type InferInsertModel, type InferSelectModel } from 'drizzle-orm';

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

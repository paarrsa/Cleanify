import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .min(16, 'TELEGRAM_WEBHOOK_SECRET must be at least 16 characters'),
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),
  ADMIN_USER_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .map(Number),
    ),
  SENTRY_DSN: z.string().url().optional(),
  HELP_VIDEO_FILE_ID: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/** Parses and validates process.env once per cold start; throws with a clear message on misconfiguration. */
export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (issue) => `- ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

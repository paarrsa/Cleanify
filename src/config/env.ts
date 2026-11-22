import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
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
  // An unset var in .env still arrives as "" (not undefined), which .url() would reject on its
  // own — treat a blank string the same as "not provided".
  SENTRY_DSN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().optional(),
  ),
  /** Public channel users must join before they can use the bot, e.g. "@rawrealities". Leave
   * blank to disable. The bot must be an admin of this channel to check membership. */
  FORCE_JOIN_CHANNEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .regex(/^@?[A-Za-z0-9_]{5,32}$/, 'FORCE_JOIN_CHANNEL must be a public @username')
      .transform((value) => (value.startsWith('@') ? value : `@${value}`))
      .optional(),
  ),
  /** Raw JSON of the bot's getMe() response. When set, skips grammY's automatic getMe() call on
   * startup — saves one network round-trip before the bot can start polling. Regenerate with:
   * curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" | jq -c .result
   * if the bot's username/name ever changes. */
  TELEGRAM_BOT_INFO: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/** Parses and validates process.env once at startup; throws with a clear message on misconfiguration. */
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

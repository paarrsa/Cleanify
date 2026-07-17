import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const channelMemberRole = pgEnum('channel_member_role', ['owner', 'admin']);

export const jobType = pgEnum('job_type', ['delete_range', 'scheduled_cleanup', 'broadcast']);

export const jobStatus = pgEnum('job_status', [
  'pending_confirmation',
  'confirmed',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

/** A Telegram user who has interacted with the bot. `id` is the Telegram user id. */
export const users = pgTable('users', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  username: text('username'),
  /** Null until the user explicitly picks a language via /en, /fa, or the language-select
   * keyboard — identifyUser middleware treats null as "show the prompt", so this must not have
   * a default. */
  language: text('language'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A Telegram channel the bot has been asked to manage. */
export const channels = pgTable('channels', {
  id: serial('id').primaryKey(),
  telegramChatId: bigint('telegram_chat_id', { mode: 'number' }).notNull().unique(),
  title: text('title'),
  username: text('username'),
  /** Auto-cleanup only ever applies going forward from whenever the bot started observing the
   * channel via `channel_post` updates (see `message_log`) — never retroactively. */
  autoCleanupEnabled: boolean('auto_cleanup_enabled').notNull().default(false),
  autoCleanupDays: integer('auto_cleanup_days'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Join table between users and channels. This is what makes multi-channel-per-user and
 * multi-admin-per-channel a UI-only change later, instead of a schema migration.
 */
export const channelMembers = pgTable(
  'channel_members',
  {
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    role: channelMemberRole('role').notNull().default('admin'),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.userId] }),
    index('channel_members_user_id_idx').on(table.userId),
  ],
);

/**
 * One generic job table for every long-running/confirmable action (delete range, scheduled
 * cleanup, broadcast) instead of a table per feature, so status tracking and audit logging
 * are written once and reused by every job type.
 */
export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  type: jobType('type').notNull(),
  channelId: integer('channel_id').references(() => channels.id),
  requestedBy: bigint('requested_by', { mode: 'number' })
    .notNull()
    .references(() => users.id),
  payload: jsonb('payload').notNull().default({}),
  status: jobStatus('status').notNull().default('pending_confirmation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/** Audit trail of completed actions. `summary` holds counts/ranges only, never message content. */
export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  jobId: integer('job_id').references(() => jobs.id),
  channelId: integer('channel_id').references(() => channels.id),
  actorUserId: bigint('actor_user_id', { mode: 'number' })
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  summary: jsonb('summary').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Log of message ids/timestamps observed via `channel_post` updates, populated going forward
 * from whenever the bot starts watching a channel. Powers scheduled auto-cleanup; cannot cover
 * history predating the bot's membership since Telegram gives bots no way to look that up.
 */
export const messageLog = pgTable(
  'message_log',
  {
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id),
    messageId: bigint('message_id', { mode: 'number' }).notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.messageId] }),
    index('message_log_channel_posted_idx').on(table.channelId, table.postedAt),
  ],
);

/** Backing store for grammY's session middleware, keyed by chat id (or `${chatId}:${userId}`). */
export const botSessions = pgTable('bot_sessions', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

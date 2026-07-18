import type { BotContext } from '@/bot/context.js';
import {
  broadcastOptionsKeyboard,
  cancelBroadcastKeyboard,
} from '@/bot/keyboards/confirmBroadcast.js';
import { mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import {
  receiveBroadcastContent,
  resetBroadcastFlow,
  setBroadcastAudience,
  startBroadcastFlow,
  toggleBroadcastSilent,
  type BroadcastAudience,
} from '@/bot/state/broadcastFlowState.js';
import { getEnv } from '@/config/env.js';
import type { Database } from '@/db/client.js';
import { getChannelAdminUserIds } from '@/db/repositories/channels.js';
import { createJob } from '@/db/repositories/jobs.js';
import { getAllUserIds, getUserIdsByLanguage } from '@/db/repositories/users.js';
import { isSupportedLocale, t } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';
import type { BroadcastJobPayload } from '@/telegram/broadcastQueue.js';

/** Telegram authenticates `ctx.from.id` for us (webhook secret + Bot API), so this allowlist
 * check is sufficient auth — no separate credential scheme needed, unlike the legacy bot's
 * unauthenticated HTTP broadcast endpoint. */
export function isAdmin(ctx: BotContext): boolean {
  return ctx.from !== undefined && getEnv().ADMIN_USER_IDS.includes(ctx.from.id);
}

async function resolveAudienceUserIds(
  db: Database,
  audience: BroadcastAudience,
): Promise<number[]> {
  switch (audience) {
    case 'all':
      return getAllUserIds(db);
    case 'en':
    case 'fa':
      return getUserIdsByLanguage(db, audience);
    case 'admins':
      return getChannelAdminUserIds(db);
  }
}

export function createBroadcastFlow(db: Database) {
  async function begin(ctx: BotContext) {
    if (!isAdmin(ctx)) {
      await ctx.reply(t(ctx.locale, 'broadcast.unauthorized'));
      return;
    }
    ctx.session.broadcast = startBroadcastFlow();
    await ctx.reply(t(ctx.locale, 'broadcast.contentPrompt'), {
      reply_markup: cancelBroadcastKeyboard(ctx.locale),
    });
  }

  async function cancel(ctx: BotContext) {
    ctx.session.broadcast = resetBroadcastFlow();
    await ctx.reply(t(ctx.locale, 'broadcast.cancelled'), {
      reply_markup: mainMenuKeyboard(ctx.locale),
    });
  }

  /** Renders (or re-renders, via edit) the audience/silent/confirm options screen, with a live
   * recipient count for whichever audience is currently selected. */
  async function showOptions(ctx: BotContext, edit: boolean) {
    const { broadcast } = ctx.session;
    if (broadcast.state !== 'configuring' || !broadcast.audience) {
      return;
    }
    const count = (await resolveAudienceUserIds(db, broadcast.audience)).length;
    const text = t(ctx.locale, 'broadcast.optionsPrompt', { count });
    const reply_markup = broadcastOptionsKeyboard(
      ctx.locale,
      broadcast.audience,
      broadcast.silent ?? false,
    );
    if (edit) {
      await ctx.editMessageText(text, { reply_markup });
    } else {
      await ctx.reply(text, { reply_markup });
    }
  }

  /** Returns true if the message was consumed as broadcast content (any message type — text,
   * photo, video, document, ... — copyMessage re-sends it as-is to every recipient). */
  async function handleContent(ctx: BotContext): Promise<boolean> {
    if (!isAdmin(ctx) || !ctx.message || ctx.session.broadcast.state !== 'awaiting_content') {
      return false;
    }
    const next = receiveBroadcastContent(ctx.session.broadcast, {
      fromChatId: ctx.message.chat.id,
      messageId: ctx.message.message_id,
    });
    if (!next) {
      return false;
    }
    ctx.session.broadcast = next;
    await showOptions(ctx, false);
    return true;
  }

  async function handleAudienceChoice(ctx: BotContext, audience: BroadcastAudience) {
    await ctx.answerCallbackQuery();
    if (!isAdmin(ctx)) {
      return;
    }
    const next = setBroadcastAudience(ctx.session.broadcast, audience);
    if (!next) {
      return;
    }
    ctx.session.broadcast = next;
    await showOptions(ctx, true);
  }

  async function handleSilentToggle(ctx: BotContext) {
    await ctx.answerCallbackQuery();
    if (!isAdmin(ctx)) {
      return;
    }
    const next = toggleBroadcastSilent(ctx.session.broadcast);
    if (!next) {
      return;
    }
    ctx.session.broadcast = next;
    await showOptions(ctx, true);
  }

  async function handleConfirm(ctx: BotContext) {
    await ctx.answerCallbackQuery();
    const { broadcast } = ctx.session;
    if (
      !isAdmin(ctx) ||
      !ctx.from ||
      broadcast.state !== 'configuring' ||
      broadcast.fromChatId === undefined ||
      broadcast.messageId === undefined ||
      !broadcast.audience
    ) {
      return;
    }

    const { fromChatId, messageId, audience, silent } = broadcast;
    const userIds = await resolveAudienceUserIds(db, audience);
    ctx.session.broadcast = resetBroadcastFlow();

    if (userIds.length === 0) {
      await ctx.editMessageText(t(ctx.locale, 'broadcast.emptyAudience'));
      return;
    }

    // This same message becomes the live progress display, edited in place by
    // processBroadcastBatch on every tick — so the admin can watch it advance instead of just
    // getting a single message at the very end.
    await ctx.editMessageText(
      t(ctx.locale, 'broadcast.progress', {
        sent: 0,
        failed: 0,
        remaining: userIds.length,
        total: userIds.length,
      }),
    );
    const statusMessage = ctx.callbackQuery?.message;
    if (!statusMessage) {
      logger.error({ audience }, 'Broadcast confirm: no status message to attach progress to');
      return;
    }

    const payload: BroadcastJobPayload = {
      fromChatId,
      messageId,
      silent: silent ?? false,
      audience,
      remainingUserIds: userIds,
      totalCount: userIds.length,
      sentCount: 0,
      failedCount: 0,
      failureReasons: {},
      statusChatId: statusMessage.chat.id,
      statusMessageId: statusMessage.message_id,
    };
    const job = await createJob(db, {
      type: 'broadcast',
      requestedBy: ctx.from.id,
      payload,
      status: 'running',
    });

    logger.info({ jobId: job.id, audience, count: userIds.length }, 'Broadcast job queued');
  }

  return { begin, cancel, handleContent, handleAudienceChoice, handleSilentToggle, handleConfirm };
}

/** Parses `broadcast:audience:<value>` callback data, guarding against unexpected/tampered
 * callback_data rather than trusting it's always one of our own generated buttons. */
export function parseAudienceCallback(data: string | undefined): BroadcastAudience | undefined {
  const value = data?.split(':')[2];
  return value && isBroadcastAudience(value) ? value : undefined;
}

function isBroadcastAudience(value: string): value is BroadcastAudience {
  return value === 'all' || value === 'admins' || isSupportedLocale(value);
}

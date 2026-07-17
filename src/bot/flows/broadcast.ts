import type { BotContext } from '@/bot/context.js';
import {
  cancelBroadcastKeyboard,
  confirmBroadcastKeyboard,
} from '@/bot/keyboards/confirmBroadcast.js';
import { mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import {
  receiveBroadcastText,
  resetBroadcastFlow,
  startBroadcastFlow,
} from '@/bot/state/broadcastFlowState.js';
import { getEnv } from '@/config/env.js';
import type { Database } from '@/db/client.js';
import { getAllUserIds } from '@/db/repositories/users.js';
import { t } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';
import { broadcastToUsers } from '@/telegram/broadcastQueue.js';

/** Telegram authenticates `ctx.from.id` for us (webhook secret + Bot API), so this allowlist
 * check is sufficient auth — no separate credential scheme needed, unlike the legacy bot's
 * unauthenticated HTTP broadcast endpoint. */
export function isAdmin(ctx: BotContext): boolean {
  return ctx.from !== undefined && getEnv().ADMIN_USER_IDS.includes(ctx.from.id);
}

export function createBroadcastFlow(db: Database) {
  async function begin(ctx: BotContext) {
    if (!isAdmin(ctx)) {
      await ctx.reply(t(ctx.locale, 'broadcast.unauthorized'));
      return;
    }
    ctx.session.broadcast = startBroadcastFlow();
    await ctx.reply(t(ctx.locale, 'broadcast.prompt'), {
      reply_markup: cancelBroadcastKeyboard(ctx.locale),
    });
  }

  async function cancel(ctx: BotContext) {
    ctx.session.broadcast = resetBroadcastFlow();
    await ctx.reply(t(ctx.locale, 'broadcast.cancelled'), {
      reply_markup: mainMenuKeyboard(ctx.locale),
    });
  }

  /** Returns true if the message was consumed as broadcast text input. */
  async function handleText(ctx: BotContext): Promise<boolean> {
    const text = ctx.message?.text;
    if (!isAdmin(ctx) || !text || ctx.session.broadcast.state !== 'awaiting_text') {
      return false;
    }
    const next = receiveBroadcastText(ctx.session.broadcast, text);
    if (!next) {
      return false;
    }
    ctx.session.broadcast = next;

    const userIds = await getAllUserIds(db);
    await ctx.reply(t(ctx.locale, 'broadcast.confirmPrompt', { count: userIds.length }), {
      reply_markup: confirmBroadcastKeyboard(ctx.locale),
    });
    return true;
  }

  async function handleConfirm(ctx: BotContext) {
    await ctx.answerCallbackQuery();
    const { broadcast } = ctx.session;
    if (!isAdmin(ctx) || broadcast.state !== 'confirming' || !broadcast.text) {
      return;
    }
    const text = broadcast.text;
    ctx.session.broadcast = resetBroadcastFlow();

    const userIds = await getAllUserIds(db);
    await ctx.reply(t(ctx.locale, 'broadcast.sending', { count: userIds.length }));

    // Runs synchronously within the webhook response, same execution-time caveat as the
    // delete-range flow — a candidate for a Netlify Background Function for large user bases.
    try {
      const { sent, failed } = await broadcastToUsers(ctx.api, userIds, text);
      await ctx.reply(t(ctx.locale, 'broadcast.done', { count: sent, failed }), {
        reply_markup: mainMenuKeyboard(ctx.locale),
      });
    } catch (error) {
      logger.error({ error }, 'Broadcast failed');
    }
  }

  return { begin, cancel, handleText, handleConfirm };
}

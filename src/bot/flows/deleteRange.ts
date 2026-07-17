import type { Message } from 'grammy/types';

import { checkChannelAdmin } from '@/bot/middleware/requireChannelAdmin.js';
import type { BotContext } from '@/bot/context.js';
import { cancelKeyboard, mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import { confirmDeleteKeyboard } from '@/bot/keyboards/confirmDelete.js';
import {
  confirmDeleteFlow,
  estimateMessageCount,
  receiveFirstMessage,
  receiveSecondMessage,
  resetDeleteFlow,
  startDeleteFlow,
} from '@/bot/state/deleteFlowState.js';
import type { Database } from '@/db/client.js';
import { recordAuditLogEntry } from '@/db/repositories/auditLog.js';
import {
  addChannelMember,
  getChannelByTelegramId,
  upsertChannel,
} from '@/db/repositories/channels.js';
import { createJob, updateJobStatus } from '@/db/repositories/jobs.js';
import { t } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';
import { deleteMessageRange } from '@/telegram/deleteQueue.js';

interface ChannelForwardOrigin {
  channelId: number;
  channelTitle: string | undefined;
  messageId: number;
}

function getChannelForwardOrigin(message: Message): ChannelForwardOrigin | undefined {
  const origin = message.forward_origin;
  if (origin?.type === 'channel') {
    return {
      channelId: origin.chat.id,
      channelTitle: origin.chat.title,
      messageId: origin.message_id,
    };
  }
  return undefined;
}

export function createDeleteRangeFlow(db: Database) {
  async function begin(ctx: BotContext) {
    ctx.session.deleteFlow = startDeleteFlow();
    await ctx.reply(t(ctx.locale, 'deleteFlow.firstMessagePrompt'), {
      reply_markup: cancelKeyboard(ctx.locale),
    });
  }

  async function cancel(ctx: BotContext) {
    ctx.session.deleteFlow = resetDeleteFlow();
    await ctx.reply(t(ctx.locale, 'deleteFlow.cancelled'), {
      reply_markup: mainMenuKeyboard(ctx.locale),
    });
  }

  /** Returns true if the message was consumed as part of the delete-range flow. */
  async function handleForwardedMessage(ctx: BotContext): Promise<boolean> {
    const message = ctx.message;
    const flow = ctx.session.deleteFlow;
    if (
      !message ||
      !ctx.from ||
      (flow.state !== 'awaiting_first' && flow.state !== 'awaiting_last')
    ) {
      return false;
    }

    const origin = getChannelForwardOrigin(message);
    if (!origin) {
      await ctx.reply(t(ctx.locale, 'errors.channelError'));
      return true;
    }

    if (flow.state === 'awaiting_first') {
      await handleFirstMessage(ctx, flow, origin);
      return true;
    }

    await handleSecondMessage(ctx, flow, origin);
    return true;
  }

  async function handleFirstMessage(
    ctx: BotContext,
    flow: BotContext['session']['deleteFlow'],
    origin: ChannelForwardOrigin,
  ) {
    if (!ctx.from) return;

    const access = await checkChannelAdmin(ctx.api, origin.channelId, ctx.from.id);
    if (!access.allowed) {
      ctx.session.deleteFlow = resetDeleteFlow();
      await ctx.reply(
        t(
          ctx.locale,
          access.reason === 'bot_lacks_access' ? 'errors.adminError' : 'errors.deniedError',
        ),
        { reply_markup: mainMenuKeyboard(ctx.locale) },
      );
      return;
    }

    const channel = await upsertChannel(db, {
      telegramChatId: origin.channelId,
      title: origin.channelTitle ?? null,
    });
    await addChannelMember(db, { channelId: channel.id, userId: ctx.from.id, role: 'admin' });

    const result = receiveFirstMessage(flow, {
      channelId: origin.channelId,
      channelTitle: origin.channelTitle,
      messageId: origin.messageId,
    });
    if (!result.ok) {
      return;
    }
    ctx.session.deleteFlow = result.session;
    await ctx.reply(t(ctx.locale, 'deleteFlow.secondMessagePrompt'), {
      reply_markup: cancelKeyboard(ctx.locale),
    });
  }

  async function handleSecondMessage(
    ctx: BotContext,
    flow: BotContext['session']['deleteFlow'],
    origin: ChannelForwardOrigin,
  ) {
    if (!ctx.from) return;

    const result = receiveSecondMessage(flow, {
      channelId: origin.channelId,
      messageId: origin.messageId,
    });
    if (!result.ok) {
      if (result.error === 'different_channel') {
        ctx.session.deleteFlow = resetDeleteFlow();
        await ctx.reply(t(ctx.locale, 'errors.differentChannelError'), {
          reply_markup: mainMenuKeyboard(ctx.locale),
        });
      } else if (result.error === 'out_of_order') {
        await ctx.reply(t(ctx.locale, 'errors.outOfOrder'));
      }
      return;
    }

    const { channelId, channelTitle, firstMessageId, lastMessageId } = result.session;
    if (channelId === undefined || firstMessageId === undefined || lastMessageId === undefined) {
      return;
    }
    const estimatedCount = estimateMessageCount(firstMessageId, lastMessageId);

    const channel = await getChannelByTelegramId(db, channelId);
    const job = await createJob(db, {
      type: 'delete_range',
      channelId: channel?.id,
      requestedBy: ctx.from.id,
      payload: { channelId, firstMessageId, lastMessageId, estimatedCount },
      status: 'pending_confirmation',
    });

    ctx.session.deleteFlow = { ...result.session, jobId: job.id };
    await ctx.reply(
      t(ctx.locale, 'deleteFlow.confirmPrompt', {
        count: estimatedCount,
        channel: channelTitle ?? String(channelId),
      }),
      { reply_markup: confirmDeleteKeyboard(ctx.locale) },
    );
  }

  async function handleConfirm(ctx: BotContext) {
    const flow = ctx.session.deleteFlow;
    const result = confirmDeleteFlow(flow);
    await ctx.answerCallbackQuery();
    if (!result.ok) {
      return;
    }
    ctx.session.deleteFlow = result.session;

    const { channelId, firstMessageId, lastMessageId, jobId } = result.session;
    if (
      channelId === undefined ||
      firstMessageId === undefined ||
      lastMessageId === undefined ||
      !ctx.from
    ) {
      return;
    }

    if (jobId !== undefined) {
      await updateJobStatus(db, jobId, 'running');
    }
    await ctx.reply(t(ctx.locale, 'deleteFlow.waiting'));

    // Runs synchronously within the webhook response. Fine for typical ranges; very large ranges
    // (tens of thousands of messages, i.e. hundreds of chunked API calls) risk the function's
    // execution time limit — a candidate for a Netlify Background Function if that becomes an
    // issue in practice.
    try {
      const { attemptedCount } = await deleteMessageRange(
        ctx.api,
        channelId,
        firstMessageId,
        lastMessageId,
      );

      const channel = await upsertChannel(db, { telegramChatId: channelId });
      await recordAuditLogEntry(db, {
        jobId,
        channelId: channel.id,
        actorUserId: ctx.from.id,
        action: 'delete_range',
        summary: { firstMessageId, lastMessageId, attemptedCount },
      });
      if (jobId !== undefined) {
        await updateJobStatus(db, jobId, 'completed', new Date());
      }

      await ctx.reply(t(ctx.locale, 'deleteFlow.done', { count: attemptedCount }), {
        reply_markup: mainMenuKeyboard(ctx.locale),
      });
    } catch (error) {
      logger.error(
        { error, channelId, firstMessageId, lastMessageId },
        'Failed to execute delete range job',
      );
      if (jobId !== undefined) {
        await updateJobStatus(db, jobId, 'failed', new Date());
      }
      await ctx.reply(t(ctx.locale, 'errors.invalid'), {
        reply_markup: mainMenuKeyboard(ctx.locale),
      });
    } finally {
      ctx.session.deleteFlow = resetDeleteFlow();
    }
  }

  return { begin, cancel, handleForwardedMessage, handleConfirm };
}

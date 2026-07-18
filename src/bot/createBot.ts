import { Bot, webhookCallback } from 'grammy';
import type { UserFromGetMe } from 'grammy/types';

import { createChannelsCommand } from '@/bot/commands/channels.js';
import { helpCommand } from '@/bot/commands/help.js';
import { createHistoryCommand } from '@/bot/commands/history.js';
import { createLanguageHandlers } from '@/bot/commands/language.js';
import { startCommand } from '@/bot/commands/start.js';
import { supportCommand } from '@/bot/commands/support.js';
import type { BotContext } from '@/bot/context.js';
import { createAutoCleanupFlow } from '@/bot/flows/autoCleanup.js';
import { createBroadcastFlow, parseAudienceCallback } from '@/bot/flows/broadcast.js';
import { createDeleteRangeFlow } from '@/bot/flows/deleteRange.js';
import { mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import { createIdentifyUserMiddleware } from '@/bot/middleware/identifyUser.js';
import { createSessionMiddleware } from '@/bot/middleware/session.js';
import { getEnv } from '@/config/env.js';
import type { Database } from '@/db/client.js';
import { getChannelByTelegramId } from '@/db/repositories/channels.js';
import { recordMessageLogEntry } from '@/db/repositories/messageLog.js';
import { t } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';

export function createBot(db: Database): Bot<BotContext> {
  const env = getEnv();
  const bot = new Bot<BotContext>(env.TELEGRAM_BOT_TOKEN, {
    ...(env.TELEGRAM_BOT_INFO
      ? { botInfo: JSON.parse(env.TELEGRAM_BOT_INFO) as UserFromGetMe }
      : {}),
  });

  bot.use(createSessionMiddleware(db));
  bot.use(createIdentifyUserMiddleware(db));

  const language = createLanguageHandlers(db);
  const deleteRange = createDeleteRangeFlow(db);
  const broadcast = createBroadcastFlow(db);
  const autoCleanup = createAutoCleanupFlow(db);
  const historyCommand = createHistoryCommand(db);
  const channelsCommand = createChannelsCommand(db);

  bot.command('start', startCommand);
  bot.command('en', language.fromCommand('en'));
  bot.command('fa', language.fromCommand('fa'));
  bot.command('history', historyCommand);
  bot.command('channels', channelsCommand);
  bot.command('broadcast', (ctx) => broadcast.begin(ctx));
  bot.command('autocleanup', (ctx) =>
    ctx.match === 'off' ? autoCleanup.disable(ctx) : autoCleanup.begin(ctx),
  );

  bot.callbackQuery(/^lang:/, (ctx) => language.fromCallback(ctx));
  bot.callbackQuery('menu:delete', async (ctx) => {
    await ctx.answerCallbackQuery();
    await deleteRange.begin(ctx);
  });
  bot.callbackQuery('menu:help', async (ctx) => {
    await ctx.answerCallbackQuery();
    await helpCommand(ctx);
  });
  bot.callbackQuery('menu:support', async (ctx) => {
    await ctx.answerCallbackQuery();
    await supportCommand(ctx);
  });
  bot.callbackQuery('menu:history', async (ctx) => {
    await ctx.answerCallbackQuery();
    await historyCommand(ctx);
  });
  bot.callbackQuery('menu:channels', async (ctx) => {
    await ctx.answerCallbackQuery();
    await channelsCommand(ctx);
  });

  // Shared "cancel" button used by any single-active-flow text prompt (delete-range or
  // auto-cleanup setup); dispatches to whichever flow is actually in progress.
  bot.callbackQuery('flow:cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    if (ctx.session.deleteFlow.state !== 'idle') {
      await deleteRange.cancel(ctx);
    } else if (ctx.session.autoCleanup.state !== 'idle') {
      await autoCleanup.cancel(ctx);
    }
  });
  bot.callbackQuery('flow:confirm', (ctx) => deleteRange.handleConfirm(ctx));

  bot.callbackQuery(/^autocleanup:channel:/, (ctx) => autoCleanup.handleChannelChoice(ctx));
  bot.callbackQuery(/^broadcast:audience:/, async (ctx) => {
    const audience = parseAudienceCallback(ctx.callbackQuery.data);
    if (!audience) {
      await ctx.answerCallbackQuery();
      return;
    }
    await broadcast.handleAudienceChoice(ctx, audience);
  });
  bot.callbackQuery('broadcast:silent', (ctx) => broadcast.handleSilentToggle(ctx));
  bot.callbackQuery('broadcast:confirm', (ctx) => broadcast.handleConfirm(ctx));
  bot.callbackQuery('broadcast:cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    await broadcast.cancel(ctx);
  });

  bot.on('channel_post', async (ctx) => {
    const post = ctx.channelPost;
    const channel = await getChannelByTelegramId(db, post.chat.id);
    if (!channel) return; // only track channels the bot already knows about via the delete flow
    await recordMessageLogEntry(db, {
      channelId: channel.id,
      messageId: post.message_id,
      postedAt: new Date(post.date * 1000),
    });
  });

  bot.on('message', async (ctx) => {
    if (await deleteRange.handleForwardedMessage(ctx)) return;
    if (await broadcast.handleContent(ctx)) return;
    if (await autoCleanup.handleDaysInput(ctx)) return;
    if (ctx.message.text?.startsWith('/')) return;
    await ctx.reply(t(ctx.locale, 'errors.invalid'), {
      reply_markup: mainMenuKeyboard(ctx.locale),
    });
  });

  bot.catch((err) => {
    logger.error({ err: err.error, updateId: err.ctx.update.update_id }, 'Unhandled bot error');
  });

  return bot;
}

export function createWebhookHandler(db: Database) {
  const bot = createBot(db);
  return webhookCallback(bot, 'std/http');
}

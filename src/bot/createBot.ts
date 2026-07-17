import { Bot, webhookCallback } from 'grammy';

import type { BotContext } from '@/bot/context.js';
import { startCommand } from '@/bot/commands/start.js';
import { createLanguageHandlers } from '@/bot/commands/language.js';
import { helpCommand } from '@/bot/commands/help.js';
import { supportCommand } from '@/bot/commands/support.js';
import { createDeleteRangeFlow } from '@/bot/flows/deleteRange.js';
import { mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import { createIdentifyUserMiddleware } from '@/bot/middleware/identifyUser.js';
import { createSessionMiddleware } from '@/bot/middleware/session.js';
import { getEnv } from '@/config/env.js';
import type { Database } from '@/db/client.js';
import { t } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';

export function createBot(db: Database): Bot<BotContext> {
  const bot = new Bot<BotContext>(getEnv().TELEGRAM_BOT_TOKEN);

  bot.use(createSessionMiddleware(db));
  bot.use(createIdentifyUserMiddleware(db));

  const language = createLanguageHandlers(db);
  const deleteRange = createDeleteRangeFlow(db);

  bot.command('start', startCommand);
  bot.command('en', language.fromCommand('en'));
  bot.command('fa', language.fromCommand('fa'));

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
  bot.callbackQuery('flow:cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    await deleteRange.cancel(ctx);
  });
  bot.callbackQuery('flow:confirm', (ctx) => deleteRange.handleConfirm(ctx));

  bot.on('message', async (ctx) => {
    const consumed = await deleteRange.handleForwardedMessage(ctx);
    if (consumed) return;
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

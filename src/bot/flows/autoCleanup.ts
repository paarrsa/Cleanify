import type { BotContext } from '@/bot/context.js';
import { cancelKeyboard, mainMenuKeyboard } from '@/bot/keyboards/mainMenu.js';
import { channelSelectKeyboard } from '@/bot/keyboards/channelSelect.js';
import {
  chooseSingleChannel,
  parseDays,
  resetAutoCleanupFlow,
  selectChannel,
  startChoosingChannel,
} from '@/bot/state/autoCleanupFlowState.js';
import type { Database } from '@/db/client.js';
import {
  disableAutoCleanupForUser,
  getChannelsForUser,
  setAutoCleanup,
} from '@/db/repositories/channels.js';
import { t } from '@/i18n/index.js';

export function createAutoCleanupFlow(db: Database) {
  async function begin(ctx: BotContext) {
    if (!ctx.from) return;
    const rows = await getChannelsForUser(db, ctx.from.id);
    if (rows.length === 0) {
      await ctx.reply(t(ctx.locale, 'channels.empty'));
      return;
    }
    if (rows.length === 1) {
      const only = rows[0]!.channel;
      ctx.session.autoCleanup = chooseSingleChannel(only.id);
      await ctx.reply(t(ctx.locale, 'scheduledCleanup.daysPrompt'), {
        reply_markup: cancelKeyboard(ctx.locale),
      });
      return;
    }

    ctx.session.autoCleanup = startChoosingChannel();
    const options = rows.map((row) => ({
      id: row.channel.id,
      label: row.channel.title ?? row.channel.username ?? String(row.channel.telegramChatId),
    }));
    await ctx.reply(t(ctx.locale, 'scheduledCleanup.chooseChannel'), {
      reply_markup: channelSelectKeyboard(options),
    });
  }

  async function handleChannelChoice(ctx: BotContext) {
    await ctx.answerCallbackQuery();
    const data = ctx.callbackQuery?.data;
    const channelId = data ? Number(data.split(':')[2]) : NaN;
    if (Number.isNaN(channelId)) return;

    const next = selectChannel(ctx.session.autoCleanup, channelId);
    if (!next) return;
    ctx.session.autoCleanup = next;
    await ctx.reply(t(ctx.locale, 'scheduledCleanup.daysPrompt'), {
      reply_markup: cancelKeyboard(ctx.locale),
    });
  }

  /** Returns true if the message was consumed as a day-count answer. */
  async function handleDaysInput(ctx: BotContext): Promise<boolean> {
    const text = ctx.message?.text;
    const flow = ctx.session.autoCleanup;
    if (!text || flow.state !== 'awaiting_days' || flow.channelId === undefined) {
      return false;
    }

    const days = parseDays(text);
    if (days === undefined) {
      await ctx.reply(t(ctx.locale, 'scheduledCleanup.invalidDays'));
      return true;
    }

    await setAutoCleanup(db, flow.channelId, { enabled: true, days });
    ctx.session.autoCleanup = resetAutoCleanupFlow();
    await ctx.reply(
      `${t(ctx.locale, 'scheduledCleanup.enabled', { days })}\n\n${t(ctx.locale, 'scheduledCleanup.limitationNotice')}`,
      { reply_markup: mainMenuKeyboard(ctx.locale) },
    );
    return true;
  }

  async function disable(ctx: BotContext) {
    if (!ctx.from) return;
    await disableAutoCleanupForUser(db, ctx.from.id);
    ctx.session.autoCleanup = resetAutoCleanupFlow();
    await ctx.reply(t(ctx.locale, 'scheduledCleanup.disabled'), {
      reply_markup: mainMenuKeyboard(ctx.locale),
    });
  }

  async function cancel(ctx: BotContext) {
    ctx.session.autoCleanup = resetAutoCleanupFlow();
    await ctx.reply(t(ctx.locale, 'scheduledCleanup.setupCancelled'), {
      reply_markup: mainMenuKeyboard(ctx.locale),
    });
  }

  return { begin, handleChannelChoice, handleDaysInput, disable, cancel };
}

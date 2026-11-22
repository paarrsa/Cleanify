import { InlineKeyboard, type Api, type NextFunction } from 'grammy';

import type { BotContext } from '@/bot/context.js';
import { startCommand } from '@/bot/commands/start.js';
import { t, type Locale } from '@/i18n/index.js';
import { logger } from '@/logging/logger.js';

export const FORCE_JOIN_CHECK_CALLBACK = 'forcejoin:check';

export type MembershipStatus = 'member' | 'not_member' | 'unknown';

/**
 * Asks Telegram whether `userId` is subscribed to `channel` (an `@username`). Returns `unknown`
 * when the lookup itself fails — most commonly because the bot isn't an admin of the channel,
 * which Telegram requires before it will reveal channel membership.
 */
export async function checkChannelMembership(
  api: Pick<Api, 'getChatMember'>,
  channel: string,
  userId: number,
): Promise<MembershipStatus> {
  try {
    const member = await api.getChatMember(channel, userId);
    switch (member.status) {
      case 'creator':
      case 'administrator':
      case 'member':
        return 'member';
      case 'restricted':
        return member.is_member ? 'member' : 'not_member';
      default:
        return 'not_member';
    }
  } catch (error) {
    logger.warn(
      { err: error, channel },
      'Force-join membership check failed; letting the user through. Is the bot an admin of the channel?',
    );
    return 'unknown';
  }
}

export function forceJoinKeyboard(locale: Locale, channel: string): InlineKeyboard {
  return new InlineKeyboard()
    .url(t(locale, 'forceJoin.joinButton'), `https://t.me/${channel.replace(/^@/, '')}`)
    .row()
    .text(t(locale, 'forceJoin.checkButton'), FORCE_JOIN_CHECK_CALLBACK);
}

/** How long a confirmed membership is trusted before asking Telegram again. */
const MEMBER_CACHE_TTL_MS = 5 * 60 * 1000;
const MEMBER_CACHE_MAX_ENTRIES = 10_000;

export interface ForceJoinOptions {
  /** Public channel username, with the leading `@`. */
  channel: string;
  /** Users who are never asked to join (the bot's own admins). */
  exemptUserIds: readonly number[];
}

/**
 * Blocks private-chat interaction until the user has joined `channel`. Must run after
 * identifyUser so the prompt is shown in the user's language. If membership can't be verified
 * (bot not an admin of the channel, network error) the user is let through rather than locked out.
 */
export function createForceJoinMiddleware({ channel, exemptUserIds }: ForceJoinOptions) {
  // Only positive results are cached, so a user who just joined is let in on the next tap.
  const confirmedUntil = new Map<number, number>();

  const isMember = async (ctx: BotContext, userId: number, useCache: boolean) => {
    const cachedUntil = confirmedUntil.get(userId);
    if (useCache && cachedUntil !== undefined && cachedUntil > Date.now()) {
      return true;
    }
    const status = await checkChannelMembership(ctx.api, channel, userId);
    if (status === 'member') {
      if (confirmedUntil.size >= MEMBER_CACHE_MAX_ENTRIES) confirmedUntil.clear();
      confirmedUntil.set(userId, Date.now() + MEMBER_CACHE_TTL_MS);
    }
    return status !== 'not_member';
  };

  return async (ctx: BotContext, next: NextFunction) => {
    if (!ctx.from || ctx.chat?.type !== 'private' || exemptUserIds.includes(ctx.from.id)) {
      return next();
    }

    if (ctx.callbackQuery?.data === FORCE_JOIN_CHECK_CALLBACK) {
      if (await isMember(ctx, ctx.from.id, false)) {
        await ctx.answerCallbackQuery({ text: t(ctx.locale, 'forceJoin.thanks') });
        await ctx.deleteMessage().catch(() => undefined);
        await startCommand(ctx);
      } else {
        await ctx.answerCallbackQuery({
          text: t(ctx.locale, 'forceJoin.notJoinedYet'),
          show_alert: true,
        });
      }
      return;
    }

    if (await isMember(ctx, ctx.from.id, true)) {
      return next();
    }

    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery();
    }
    await ctx.reply(t(ctx.locale, 'forceJoin.prompt', { channel }), {
      reply_markup: forceJoinKeyboard(ctx.locale, channel),
    });
  };
}

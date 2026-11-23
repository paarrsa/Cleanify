import { GrammyError, type Api } from 'grammy';

export type ChannelAdminCheck =
  | { allowed: true }
  | { allowed: false; reason: 'bot_lacks_access' | 'bot_cannot_delete' | 'user_not_admin' };

/**
 * Checks, via getChatMember, that the bot can actually delete messages in `channelId` and that
 * `userId` is the channel's creator/administrator. Distinguishes "the bot can't see the channel
 * at all" (needs to be added as admin), "the bot is an admin but lacks the Delete messages
 * permission", and "this user isn't an admin", so callers can show the right error message —
 * checked up front so a missing permission doesn't only surface after the user confirms a delete.
 */
export async function checkChannelAdmin(
  api: Pick<Api, 'getChatMember'>,
  channelId: number,
  userId: number,
  botId: number,
): Promise<ChannelAdminCheck> {
  try {
    const bot = await api.getChatMember(channelId, botId);
    if (bot.status !== 'administrator') {
      return { allowed: false, reason: 'bot_lacks_access' };
    }
    if (!bot.can_delete_messages) {
      return { allowed: false, reason: 'bot_cannot_delete' };
    }

    const member = await api.getChatMember(channelId, userId);
    if (member.status === 'creator' || member.status === 'administrator') {
      return { allowed: true };
    }
    return { allowed: false, reason: 'user_not_admin' };
  } catch (error) {
    if (error instanceof GrammyError) {
      return { allowed: false, reason: 'bot_lacks_access' };
    }
    throw error;
  }
}

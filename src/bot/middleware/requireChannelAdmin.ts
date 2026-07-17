import { GrammyError, type Api } from 'grammy';

export type ChannelAdminCheck =
  { allowed: true } | { allowed: false; reason: 'bot_lacks_access' | 'user_not_admin' };

/**
 * Checks whether `userId` is the creator/administrator of `channelId`, via getChatMember.
 * Distinguishes "the bot itself can't see channel membership" (needs to be added as admin) from
 * "the bot can see it, but this particular user isn't an admin" so callers can show the right
 * error message — matches the two distinct failure messages the legacy bot had.
 */
export async function checkChannelAdmin(
  api: Pick<Api, 'getChatMember'>,
  channelId: number,
  userId: number,
): Promise<ChannelAdminCheck> {
  try {
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

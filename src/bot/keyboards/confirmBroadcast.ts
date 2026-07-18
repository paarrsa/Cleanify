import { InlineKeyboard } from 'grammy';

import type { BroadcastAudience } from '@/bot/state/broadcastFlowState.js';
import { t, type Locale } from '@/i18n/index.js';

const AUDIENCE_ORDER: BroadcastAudience[] = ['all', 'en', 'fa', 'admins'];

/** The broadcast options screen: pick an audience, toggle silent delivery, then confirm — all as
 * edits to the same message rather than a new one per tap. */
export function broadcastOptionsKeyboard(
  locale: Locale,
  selectedAudience: BroadcastAudience,
  silent: boolean,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const audience of AUDIENCE_ORDER) {
    const label = t(locale, `broadcast.audience.${audience}`);
    keyboard.text(
      audience === selectedAudience ? `✅ ${label}` : label,
      `broadcast:audience:${audience}`,
    );
  }
  keyboard
    .row()
    .text(t(locale, silent ? 'broadcast.silentOn' : 'broadcast.silentOff'), 'broadcast:silent')
    .row()
    .text(t(locale, 'broadcast.confirmYes'), 'broadcast:confirm')
    .text(t(locale, 'broadcast.confirmNo'), 'broadcast:cancel');
  return keyboard;
}

export function cancelBroadcastKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard().text(t(locale, 'menu.cancel'), 'broadcast:cancel');
}

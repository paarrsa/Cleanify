import { InlineKeyboard } from 'grammy';

import { t, type Locale } from '@/i18n/index.js';

export function confirmBroadcastKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(locale, 'broadcast.confirmYes'), 'broadcast:confirm')
    .text(t(locale, 'broadcast.confirmNo'), 'broadcast:cancel');
}

export function cancelBroadcastKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard().text(t(locale, 'menu.cancel'), 'broadcast:cancel');
}

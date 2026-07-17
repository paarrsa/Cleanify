import { InlineKeyboard } from 'grammy';

import { t, type Locale } from '@/i18n/index.js';

export function mainMenuKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(locale, 'menu.delete'), 'menu:delete')
    .row()
    .text(t(locale, 'menu.channels'), 'menu:channels')
    .text(t(locale, 'menu.history'), 'menu:history')
    .row()
    .text(t(locale, 'menu.help'), 'menu:help')
    .text(t(locale, 'menu.support'), 'menu:support');
}

export function cancelKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard().text(t(locale, 'menu.cancel'), 'flow:cancel');
}

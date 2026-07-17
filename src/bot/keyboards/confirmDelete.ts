import { InlineKeyboard } from 'grammy';

import { t, type Locale } from '@/i18n/index.js';

export function confirmDeleteKeyboard(locale: Locale): InlineKeyboard {
  return new InlineKeyboard()
    .text(t(locale, 'deleteFlow.confirmYes'), 'flow:confirm')
    .text(t(locale, 'deleteFlow.confirmNo'), 'flow:cancel');
}

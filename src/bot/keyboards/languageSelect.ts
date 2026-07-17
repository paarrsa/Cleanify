import { InlineKeyboard } from 'grammy';

import { LOCALE_DISPLAY_NAMES, SUPPORTED_LOCALES } from '@/i18n/index.js';

export function languageSelectKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const locale of SUPPORTED_LOCALES) {
    keyboard.text(LOCALE_DISPLAY_NAMES[locale], `lang:${locale}`).row();
  }
  return keyboard;
}

import type { Context, SessionFlavor } from 'grammy';

import type { SessionData } from '@/bot/middleware/session.js';
import type { Locale } from '@/i18n/index.js';

export interface LocaleFlavor {
  /** Resolved by identifyUser middleware before any command/flow handler runs. */
  locale: Locale;
}

export type BotContext = Context & SessionFlavor<SessionData> & LocaleFlavor;

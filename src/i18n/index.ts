import en from '@/i18n/en.json';
import fa from '@/i18n/fa.json';

export const SUPPORTED_LOCALES = ['en', 'fa'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language's own native display name — shown the same way regardless of the viewer's
 * current UI locale, so it stays recognizable (e.g. always "🇮🇷 فارسی", never "🇮🇷 Persian"). */
export const LOCALE_DISPLAY_NAMES: Record<Locale, string> = {
  en: '🇬🇧 English',
  fa: '🇮🇷 فارسی',
};

type Messages = typeof en;

const catalogs: Record<Locale, Messages> = { en, fa };

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function getPath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match,
  );
}

/**
 * Looks up a dot-path translation key (e.g. "deleteFlow.confirmPrompt") for the given locale,
 * falling back to English for any key missing in that locale's catalog.
 */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const path = key.split('.');
  const localized = getPath(catalogs[locale], path);
  const value = typeof localized === 'string' ? localized : getPath(catalogs[DEFAULT_LOCALE], path);
  if (typeof value !== 'string') {
    throw new Error(`Missing i18n key: ${key}`);
  }
  return interpolate(value, params);
}

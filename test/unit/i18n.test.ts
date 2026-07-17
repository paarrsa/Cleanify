import { describe, expect, it } from 'vitest';

import { t } from '@/i18n/index.js';

describe('t', () => {
  it('resolves a nested key for the given locale', () => {
    expect(t('en', 'menu.delete')).toBe('Delete messages for me!');
    expect(t('fa', 'menu.delete')).toBe('برام پیام‌هام رو پاک کن!');
  });

  it('interpolates placeholder tokens', () => {
    expect(t('en', 'deleteFlow.done', { count: 5 })).toBe(
      'Done! I deleted 5 messages. Thanks for using Cleanify!',
    );
  });

  it('leaves unmatched placeholder tokens untouched', () => {
    expect(t('en', 'deleteFlow.done', {})).toBe(
      'Done! I deleted {count} messages. Thanks for using Cleanify!',
    );
  });

  it('throws for a missing key in every locale', () => {
    expect(() => t('en', 'nope.not.real')).toThrow(/Missing i18n key/);
  });
});

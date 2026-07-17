import { describe, expect, it } from 'vitest';

import { isValidWebhookSecret } from '@/telegram/verifyWebhookSecret.js';

describe('isValidWebhookSecret', () => {
  it('accepts a matching secret', () => {
    expect(isValidWebhookSecret('correct-secret', 'correct-secret')).toBe(true);
  });

  it('rejects a mismatched secret', () => {
    expect(isValidWebhookSecret('wrong-secret', 'correct-secret')).toBe(false);
  });

  it('rejects a null header', () => {
    expect(isValidWebhookSecret(null, 'correct-secret')).toBe(false);
  });

  it('rejects secrets of different lengths without throwing', () => {
    expect(isValidWebhookSecret('short', 'a-much-longer-secret-value')).toBe(false);
  });
});

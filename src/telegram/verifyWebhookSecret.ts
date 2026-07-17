import { timingSafeEqual } from 'node:crypto';

/**
 * Compares the `X-Telegram-Bot-Api-Secret-Token` header against the configured secret using a
 * constant-time comparison, so response timing can't be used to brute-force the secret.
 */
export function isValidWebhookSecret(
  receivedHeader: string | null,
  expectedSecret: string,
): boolean {
  if (!receivedHeader) {
    return false;
  }
  const received = Buffer.from(receivedHeader);
  const expected = Buffer.from(expectedSecret);
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(received, expected);
}

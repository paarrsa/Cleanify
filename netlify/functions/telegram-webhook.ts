import { createWebhookHandler } from '@/bot/createBot.js';
import { getEnv } from '@/config/env.js';
import { getDb } from '@/db/client.js';
import { logger } from '@/logging/logger.js';
import { isValidWebhookSecret } from '@/telegram/verifyWebhookSecret.js';

let handler: ((req: Request) => Promise<Response>) | undefined;

function getHandler() {
  handler ??= createWebhookHandler(getDb());
  return handler;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const env = getEnv();
  const secretHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!isValidWebhookSecret(secretHeader, env.TELEGRAM_WEBHOOK_SECRET)) {
    logger.warn('Rejected webhook request with invalid secret token');
    return new Response('Unauthorized', { status: 401 });
  }

  return getHandler()(req);
};

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

  // grammY's bot.catch() (registered in createBot.ts) only fires for handleUpdates() — the
  // long-polling batch path. webhookCallback drives handleUpdate() (singular) directly with no
  // error handling of its own, so an unhandled error here would otherwise reject straight out of
  // this function, Netlify would return a 502 with the raw exception, and Telegram would then
  // retry the *same* update indefinitely on any non-200 response — turning one bug into an
  // unbounded, ever-growing backlog. Catch here, log, and always ack with 200: retrying an
  // application error doesn't fix it, and for some updates (e.g. a delete-range job) a retry
  // could re-run already-completed side effects.
  try {
    return await getHandler()(req);
  } catch (error) {
    logger.error({ error }, 'Unhandled error processing webhook update');
    return new Response('ok');
  }
};

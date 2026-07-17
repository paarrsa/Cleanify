import 'dotenv/config';

/**
 * One-shot script to point Telegram's webhook at a deployed function URL.
 * Usage: npm run setup-webhook -- https://your-site.netlify.app/webhook
 */
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const url = process.argv[2];

  if (!token) throw new Error('TELEGRAM_BOT_TOKEN must be set');
  if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET must be set');
  if (!url) throw new Error('Usage: npm run setup-webhook -- <deployed-webhook-url>');

  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query', 'channel_post'],
    }),
  });

  const result = (await response.json()) as { ok: boolean; description?: string };
  if (!result.ok) {
    throw new Error(`setWebhook failed: ${result.description ?? 'unknown error'}`);
  }
  console.log(`Webhook set to ${url}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

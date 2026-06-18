import 'dotenv/config';
import express from 'express';

import { config } from './config.js';
import { smsRouter } from './sms/router.js';
import setupRouter from './setup/router.js';
import paystackWebhook from './payments/webhook.js';
import { bot, startReminderPoller } from './telegram/bot.js';
import { startScheduler } from './cron/scheduler.js';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SMS ingestion
app.use(smsRouter);

// Shortcut setup (one-time download link)
app.use(setupRouter);

// Paystack payment webhook
app.use(paystackWebhook);

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Start server and bot
async function start(): Promise<void> {
  await bot.telegram.deleteWebhook();
  bot.launch().then(() => {
    console.log('Telegram bot started (long polling)');
  }).catch((err) => {
    console.error('Failed to launch bot:', err);
  });

  startScheduler();
  startReminderPoller(); // ← new line

  app.listen(config.port, () => {
    console.log(`Sika server running on port ${config.port}`);
    console.log(`API endpoints ready at: http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

import express from 'express';

import { config } from './config.js';
import { smsRouter } from './sms/router.js';
import { bot } from './telegram/bot.js';
import { startScheduler } from './cron/scheduler.js';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SMS ingestion
app.use(smsRouter);

// Start server and bot
async function start(): Promise<void> {
  // Use Long Polling for the bot — much more reliable for local development
  await bot.telegram.deleteWebhook();
  bot.launch().then(() => {
    console.log('Telegram bot started (long polling)');
  }).catch((err) => {
    console.error('Failed to launch bot:', err);
  });

  // Start cron scheduler
  startScheduler();

  app.listen(config.port, () => {
    console.log(`Sika server running on port ${config.port}`);
    console.log(`API endpoints ready at: http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

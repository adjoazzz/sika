import userConfig from '../sika.config.js';

export const config = {
  databaseUrl: process.env.DATABASE_URL || userConfig.databaseUrl,
  databaseReadonlyUrl: process.env.DATABASE_URL || userConfig.databaseUrl,
  geminiApiKey: process.env.GEMINI_API_KEY || userConfig.geminiApiKey,
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || userConfig.telegramBotToken,
  telegramWebhookSecret: process.env.SMS_API_KEY || userConfig.smsApiKey,
  telegramChatId: process.env.TELEGRAM_CHAT_ID || userConfig.telegramChatId,
  webhookDomain: process.env.WEBHOOK_DOMAIN || userConfig.webhookDomain,
  smsApiKey: process.env.SMS_API_KEY || userConfig.smsApiKey,
  port: Number(process.env.PORT) || userConfig.port || 3000,
  currency: process.env.CURRENCY || userConfig.currency || 'GHS',
  banks: userConfig.banks || [],
  categories: userConfig.categories || [],
  cronSchedule: {
    weeklySummary: userConfig.weeklySummary || '0 19 * * 0',
    monthlySummary: userConfig.monthlySummary || '0 8 1 * *',
    budgetAlerts: userConfig.budgetAlerts || '0 9 * * *',
    anomalyDetection: userConfig.anomalyDetection || '5 9 * * *',
  },
} as const;

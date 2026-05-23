import 'dotenv/config';
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
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || (userConfig as any).paystackSecretKey || 'sk_live_xxx',
  resendApiKey: process.env.RESEND_API_KEY || (userConfig as any).resendApiKey || 're_xxx',
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || (userConfig as any).telegramBotUsername || 'YourBotName',
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

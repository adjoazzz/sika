/**
 * PennyWatch Configuration
 *
 * Copy this file and fill in your values.
 * See README.md for how to get each credential.
 */

export default {
  // ─── Database ──────────────────────────────────────────────
  // Neon Postgres connection string (https://neon.tech — free tier works)
  databaseUrl: 'REPLACE_WITH_DATABASE_URL',

  // ─── Gemini ─────────────────────────────────────────────
  // API key from Google AI Studio
  geminiApiKey: 'REPLACE_WITH_GEMINI_API_KEY',

  // ─── Telegram Bot ──────────────────────────────────────────
  // 1. Message @BotFather on Telegram → /newbot → copy the token
  // 2. Message your bot, then visit: https://api.telegram.org/bot<TOKEN>/getUpdates
  //    to find your chat ID
  telegramBotToken: 'REPLACE_WITH_TELEGRAM_BOT_TOKEN',
  telegramChatId: 'REPLACE_WITH_TELEGRAM_CHAT_ID',

  // ─── Server ────────────────────────────────────────────────
  // Your public HTTPS domain (Telegram webhooks require HTTPS)
  webhookDomain: 'https://rotten-hairs-travel.loca.lt',
  port: 3000,

  // ─── SMS API Key ───────────────────────────────────────────
  // Generate one: openssl rand -hex 32
  // This goes in your iOS Shortcut's Authorization header
  smsApiKey: 'REPLACE_WITH_SMS_API_KEY',

  // ─── Payments (Paystack) ───────────────────────────────────
  // From your Paystack dashboard → Settings → API Keys & Webhooks
  // Set your webhook URL to: https://your-domain/payments/webhook
  paystackSecretKey: 'sk_test_690b5e3046640a5f93ed6c65a697d2511ace9583',

  // ─── Email (Resend) ────────────────────────────────────────
  // Free tier at resend.com — 100 emails/day, no credit card needed
  resendApiKey: 're_P6gAEEdR_95AmaMnKMf2ioktih1BsR72x',

  // ─── Telegram Bot Username ─────────────────────────────────
  // Without the @ — shown in the setup email so users can find your bot
  telegramBotUsername: 'ivespentmymoneybot',

  // ─── Personalization (optional) ────────────────────────────
  currency: 'GHS',

  // Banks/services you use — helps the LLM identify SMS sources
  // Add your own: { name: 'display name', id: 'lowercase_id', example: 'sample SMS' }
  banks: [
    {
      name: 'Absa',
      id: 'absa',
      example: 'Absa: GHS500.00 has been debited from your account 1234 to JOHN DOE on 09/04/2026. Ref: TXN123. Avail Bal: GHS2,500.00',
    },
    {
      name: 'MTN MoMo',
      id: 'mtn_momo',
      example: 'Payment for GHS20.00 to expressPay. Current Balance: GHS 2129.62. Transaction Id: 78903096116. Fee charged: GHS0.00',
    },
    {
      name: 'GCB',
      id: 'gcb',
      example: 'GCB: Your a/c XX1234 has been debited with GHS500.00 on 09-Apr-2026. Ref: POS Purchase. Balance: GHS3,000.00',
    },
  ],

  // Suggested categories — the LLM can use any string, but these guide it
  categories: [
    'food', 'transport', 'airtime', 'utilities', 'transfers',
    'entertainment', 'shopping', 'health', 'education', 'salary',
    'groceries', 'rent', 'fees', 'other',
  ],

  // ─── Cron Schedule (UTC) ───────────────────────────────────
  weeklySummary: '0 19 * * 0',      // Sundays 7pm
  monthlySummary: '0 8 1 * *',      // 1st of month 8am
  budgetAlerts: '0 9 * * *',        // Daily 9am
  anomalyDetection: '5 9 * * *',    // Daily 9:05am
};

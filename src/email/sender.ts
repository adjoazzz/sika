import { Resend } from 'resend';
import { config } from '../config.js';

const resend = new Resend(config.resendApiKey);

export async function sendSetupEmail(email: string, _apiKey: string, linkCode: string, setupToken: string): Promise<void> {
  const baseUrl = config.webhookDomain.replace(/\/+$/, '');
  // Per-user pages that show this user's own webhook URL + API key
  const setupUrl = `${baseUrl}/setup/ios?token=${setupToken}`;
  const botUsername = config.telegramBotUsername.replace('@', '');

  // Deep link — when tapped, opens bot and auto-sends /start <linkCode>
  const telegramBotUrl = `https://t.me/${botUsername}?start=${linkCode}`;
  const androidSetupUrl = `${baseUrl}/setup/android?token=${setupToken}`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Set Up Your Sika Financial Tracker</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #f9fafb;
          color: #111827;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #f3f4f6;
        }
        .header {
          background: linear-gradient(135deg, #534AB7 0%, #3C3489 50%, #D85A30 100%);
          padding: 40px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: -0.025em;
        }
        .content { padding: 40px 30px; }
        .welcome {
          font-size: 18px;
          line-height: 1.6;
          font-weight: 500;
          margin-bottom: 24px;
        }
        .step {
          margin-bottom: 24px;
          padding-left: 16px;
          border-left: 4px solid #534AB7;
        }
        .step-title {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #534AB7;
        }
        .step-desc {
          font-size: 15px;
          line-height: 1.5;
          color: #4b5563;
        }
        .btn-container {
          text-align: center;
          margin: 16px 0 24px 0;
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #534AB7 0%, #3C3489 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 24px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 15px;
          box-shadow: 0 4px 6px -1px rgba(83, 74, 183, 0.3);
        }
        .btn-secondary {
          display: inline-block;
          background: #10b981;
          color: #ffffff !important;
          text-decoration: none;
          padding: 14px 24px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 15px;
          box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
        }
        .btn-outline {
          display: inline-block;
          background: transparent;
          color: #534AB7 !important;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 15px;
          border: 2px solid #534AB7;
        }
        .notice {
          background: #f3f4f6;
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 13px;
          color: #6b7280;
          margin-bottom: 24px;
          line-height: 1.5;
        }
        .divider {
          height: 1px;
          background: #f3f4f6;
          margin: 28px 0;
        }
        .footer {
          background-color: #f9fafb;
          padding: 24px;
          text-align: center;
          border-top: 1px solid #f3f4f6;
          font-size: 13px;
          color: #9ca3af;
        }
        .footer a { color: #534AB7; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header"><h1>sika</h1></div>
        <div class="content">
          <p class="welcome">You're in! Sika is ready to track your transactions automatically on iOS or Android.</p>

          <div class="step">
            <div class="step-title">Step 1 — Set Up Automation</div>
            <div class="step-desc">
              Choose your phone platform to configure automatic SMS forwarding:
            </div>
          </div>

          <div class="btn-container">
            <a href="${setupUrl}" class="btn">📱 iPhone Setup Guide</a>
            <a href="${androidSetupUrl}" class="btn-secondary">🤖 Android Setup Guide</a>
          </div>

          <div class="notice">
            🔒 Your link contains your personal Sika credentials. Keep it private.
          </div>

          <div class="divider"></div>

          <div class="step">
            <div class="step-title">Step 2 — Connect Telegram</div>
            <div class="step-desc">
              Tap the button below to connect the Sika Telegram Bot to your account automatically.
            </div>
          </div>

          <div class="btn-container">
            <a href="${telegramBotUrl}" class="btn-outline">Connect Telegram →</a>
          </div>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Sika Finance. All rights reserved. &nbsp;·&nbsp; <a href="https://sikafinance.xyz/privacy.html">Privacy Policy</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  await resend.emails.send({
    from: 'Sika Finance <onboarding@sikafinance.xyz>',
    to: [email],
    subject: "You're in — set up Sika on your phone",
    html: htmlContent,
  });
}
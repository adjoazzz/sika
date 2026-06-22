import { Resend } from 'resend';
import { config } from '../config.js';

const resend = new Resend(config.resendApiKey);

const SHORTCUT_ICLOUD_URL = 'https://www.icloud.com/shortcuts/a068473f41b94071934d7e24994f3fcc';

export async function sendSetupEmail(email: string, apiKey: string, linkCode: string): Promise<void> {
  const setupUrl = `${SHORTCUT_ICLOUD_URL}?api_key=${apiKey}`;
  const botUsername = config.telegramBotUsername.replace('@', '');

  // Deep link — when tapped, opens bot and auto-sends /start <linkCode>
  const telegramBotUrl = `https://t.me/${botUsername}?start=${linkCode}`;

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
          margin-bottom: 32px;
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
          margin: 24px 0;
        }
        .btn {
          display: inline-block;
          background: linear-gradient(135deg, #534AB7 0%, #3C3489 100%);
          color: #ffffff !important;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 16px;
          box-shadow: 0 10px 15px -3px rgba(83, 74, 183, 0.3), 0 4px 6px -4px rgba(83, 74, 183, 0.3);
        }
        .btn-outline {
          display: inline-block;
          background: transparent;
          color: #534AB7 !important;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 16px;
          border: 2px solid #534AB7;
        }
        .notice {
          background: #f3f4f6;
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 13px;
          color: #6b7280;
          margin-bottom: 32px;
          line-height: 1.5;
        }
        .divider {
          height: 1px;
          background: #f3f4f6;
          margin: 32px 0;
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
          <p class="welcome">You're in! Two quick taps and Sika is ready to track every cedi.</p>

          <div class="step">
            <div class="step-title">Step 1 — Install the Sika Shortcut</div>
            <div class="step-desc">
              Tap the button below <strong>on your iPhone</strong>. It opens the Shortcuts app with your personal Sika key already configured. Just tap <strong>"Add Shortcut"</strong> — that's it.
            </div>
          </div>

          <div class="btn-container">
            <a href="${setupUrl}" class="btn">Install My Sika Shortcut →</a>
          </div>

          <div class="notice">
            🔒 This link contains your unique Sika API key. Don't share it with anyone.
          </div>

          <div class="divider"></div>

          <div class="step">
            <div class="step-title">Step 2 — Connect Telegram</div>
            <div class="step-desc">
              Tap the button below to open the Sika Telegram Bot. It will connect your account automatically — no codes to copy or paste.
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
    subject: "You're in — set up Sika on your iPhone",
    html: htmlContent,
  });
}
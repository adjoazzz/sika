import { Resend } from 'resend';
import { config } from '../config.js';

const resend = new Resend(config.resendApiKey);

const SHORTCUT_ICLOUD_URL = 'https://www.icloud.com/shortcuts/a068473f41b94071934d7e24994f3fcc';

/**
 * Sends a premium setup email to the customer containing their iCloud
 * shortcut link with their unique API key pre-filled as a URL parameter.
 */
export async function sendSetupEmail(email: string, apiKey: string): Promise<void> {
  const setupUrl = `${SHORTCUT_ICLOUD_URL}?api_key=${apiKey}`;
  const botUsername = config.telegramBotUsername.replace('@', '');
  const telegramBotUrl = `https://t.me/${botUsername}`;

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
        .content {
          padding: 40px 30px;
        }
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
          margin: 40px 0;
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
        .notice {
          background: #f3f4f6;
          border-radius: 12px;
          padding: 16px 20px;
          font-size: 13px;
          color: #6b7280;
          margin-bottom: 32px;
          line-height: 1.5;
        }
        .footer {
          background-color: #f9fafb;
          padding: 24px;
          text-align: center;
          border-top: 1px solid #f3f4f6;
          font-size: 13px;
          color: #9ca3af;
        }
        .footer a {
          color: #534AB7;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>sika</h1>
        </div>
        <div class="content">
          <p class="welcome">You're in! Let's get Sika set up on your iPhone in two quick steps.</p>
          
          <div class="step">
            <div class="step-title">Step 1: Install the Sika Shortcut</div>
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
          
          <div class="step">
            <div class="step-title">Step 2: Connect Telegram</div>
            <div class="step-desc">
              Tap <a href="${telegramBotUrl}" target="_blank" style="color:#534AB7; font-weight:600; text-decoration:none;">here to open the Sika Telegram Bot</a> and send <strong>/start</strong>. This is how Sika sends you instant transaction alerts, budget updates, and your weekly summary.
            </div>
          </div>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Sika Finance. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await resend.emails.send({
    from: 'Sika Finance <onboarding@resend.dev>',
    to: [email],
    subject: 'You\'re in — set up Sika on your iPhone 📱',
    html: htmlContent,
  });
}
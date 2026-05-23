import { Resend } from 'resend';
import { config } from '../config.js';

const resend = new Resend(config.resendApiKey);

/**
 * Sends a premium setup email to the customer containing their one-time
 * shortcut installation link and simple instructions.
 */
export async function sendSetupEmail(email: string, token: string): Promise<void> {
  const setupUrl = `${config.webhookDomain.replace(/\/$/, '')}/setup/shortcut?token=${token}`;
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
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
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
          border-left: 4px solid #f97316;
        }
        .step-title {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 8px;
          color: #ea580c;
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
          background-color: #ea580c;
          color: #ffffff !important;
          text-decoration: none;
          padding: 16px 32px;
          border-radius: 9999px;
          font-weight: 600;
          font-size: 16px;
          box-shadow: 0 10px 15px -3px rgba(234, 88, 12, 0.3), 0 4px 6px -4px rgba(234, 88, 12, 0.3);
          transition: all 0.2s ease;
        }
        .btn:hover {
          background-color: #ea580c;
          transform: translateY(-1px);
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
          color: #ea580c;
          text-decoration: none;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Sika</h1>
        </div>
        <div class="content">
          <p class="welcome">Thank you for your purchase! Let's get Sika configured on your iPhone in just two easy steps.</p>
          
          <div class="step">
            <div class="step-title">Step 1: Install the iOS Shortcut</div>
            <div class="step-desc">
              Tap the button below <strong>on your iPhone</strong>. It will download a pre-filled Apple Shortcut with your secure Sika API key and webhook endpoint pre-configured. Just tap <strong>"Add Shortcut"</strong> when prompted.
            </div>
          </div>
          
          <div class="btn-container">
            <a href="${setupUrl}" class="btn">Configure My Shortcut</a>
          </div>
          
          <div class="step">
            <div class="step-title">Step 2: Connect Telegram</div>
            <div class="step-desc">
              Tap <a href="${telegramBotUrl}" target="_blank" style="color:#ea580c; font-weight:600; text-decoration:none;">here to message our Telegram Bot</a> and tap <strong>/start</strong>. This allows Sika to send you instant transaction alerts, budgets, and weekly financial summaries.
            </div>
          </div>
        </div>
        <div class="footer">
          <p>This setup link is unique to you and can only be used once.</p>
          <p>&copy; ${new Date().getFullYear()} Sika Finance. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  await resend.emails.send({
    from: 'Sika Finance <onboarding@resend.dev>', // Resend free tier sandbox domain by default, or user's custom domain if verified
    to: [email],
    subject: 'Configure Sika on your iPhone 📱',
    html: htmlContent,
  });
}

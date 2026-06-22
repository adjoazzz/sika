import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { createSetupToken } from '../setup/tokens.js';
import { sendSetupEmail } from '../email/sender.js';
import { query } from '../db/client.js';

export const paystackWebhook = Router();

function generateLinkCode(): string {
  // Generates a short human-readable code like SIKA-4F2A
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'SIKA-';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

paystackWebhook.post(['/payments/webhook', '/api/webhooks/paystack'], async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-paystack-signature'] as string | undefined;

  if (!signature) {
    res.status(401).json({ error: 'Missing x-paystack-signature' });
    return;
  }

  const hash = crypto
    .createHmac('sha512', config.paystackSecretKey)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== signature) {
    console.error('[paystack-webhook] Signature verification failed');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = req.body;

  if (event.event === 'charge.success') {
    const email = event.data?.customer?.email;

    if (!email) {
      console.error('[paystack-webhook] Missing customer email in charge.success event');
      res.status(400).json({ error: 'Missing customer email' });
      return;
    }

    console.log(`[paystack-webhook] Payment successful for customer: ${email}`);

    const MAX_RETRIES = 3;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const userSmsApiKey = crypto.randomBytes(32).toString('hex');
        const token = await createSetupToken(userSmsApiKey, config.webhookDomain);

        // Generate a unique link code for Telegram deep linking
        let linkCode = generateLinkCode();

        // Ensure uniqueness — retry if collision
        let codeExists = true;
        while (codeExists) {
          const check = await query(
            'SELECT 1 FROM users WHERE link_code = $1',
            [linkCode],
          );
          if (check.rows.length === 0) {
            codeExists = false;
          } else {
            linkCode = generateLinkCode();
          }
        }

        // Create user row with sms_api_key and link_code
        await query(
          `INSERT INTO users (sms_api_key, email, link_code)
           VALUES ($1, $2, $3)
           ON CONFLICT (sms_api_key) DO NOTHING`,
          [userSmsApiKey, email, linkCode],
        );

        await sendSetupEmail(email, userSmsApiKey, linkCode);
        console.log(`[paystack-webhook] Onboarding setup email successfully sent to: ${email}`);
        break;
      } catch (err) {
        lastErr = err;
        console.error(`[paystack-webhook] Attempt ${attempt} failed:`, err);
        if (attempt < MAX_RETRIES) {
          await new Promise(res => setTimeout(res, 3000 * attempt));
        }
      }
    }

    if (lastErr) {
      console.error('[paystack-webhook] All retries failed for:', email);
    }
  }

  res.status(200).json({ status: 'success' });
});

export default paystackWebhook;
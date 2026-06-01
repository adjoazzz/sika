import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';
import { createSetupToken } from '../setup/tokens.js';
import { sendSetupEmail } from '../email/sender.js';

export const paystackWebhook = Router();

// Paystack webhook endpoint
paystackWebhook.post(['/payments/webhook', '/api/webhooks/paystack'], async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers['x-paystack-signature'] as string | undefined;

  if (!signature) {
    res.status(401).json({ error: 'Missing x-paystack-signature' });
    return;
  }

  // Verify HMAC SHA512 signature from Paystack
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
  
  // Listen for the successful charge event
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
    await sendSetupEmail(email, token);
    console.log(`[paystack-webhook] Onboarding setup email successfully sent to: ${email}`);
    break;
  } catch (err) {
    lastErr = err;
    console.error(`[paystack-webhook] Attempt ${attempt} failed:`, err);
    if (attempt < MAX_RETRIES) {
      await new Promise(res => setTimeout(res, 1000 * attempt));
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

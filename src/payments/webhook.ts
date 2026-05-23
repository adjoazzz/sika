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

    try {
      // 1. Generate a new secure, random API Key for the user's iPhone shortcut
      const userSmsApiKey = crypto.randomBytes(32).toString('hex');
      
      // 2. Generate a secure, one-time setup token
      const token = await createSetupToken(userSmsApiKey, config.webhookDomain);
      
      // 3. Send the onboarding setup email with the setup link
      await sendSetupEmail(email, token);

      console.log(`[paystack-webhook] Onboarding setup email successfully sent to: ${email}`);
    } catch (err) {
      console.error('[paystack-webhook] Error processing user setup on payment success:', err);
      // Still return 200 to Paystack to acknowledge receipt, otherwise they'll keep retrying
    }
  }

  res.status(200).json({ status: 'success' });
});

export default paystackWebhook;

import crypto from 'crypto';
import { query } from '../db/client.js';

/**
 * Generates a secure, one-time token for a user, stores it in the database
 * linked to their credentials (smsApiKey, serverUrl), and returns it.
 */
export async function createSetupToken(
  smsApiKey: string,
  serverUrl: string,
): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  
  await query(
    `INSERT INTO setup_tokens (token, sms_api_key, server_url, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [token, smsApiKey, serverUrl]
  );
  
  return token;
}

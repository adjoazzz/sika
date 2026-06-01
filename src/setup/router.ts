/**
 * setup/router.ts
 *
 * Serves the pre-filled .shortcut binary file to the user's iPhone.
 *
 * Flow:
 *  1. User receives a setup email containing a one-time link:
 *        https://your-domain/setup/shortcut?token=<token>
 *  2. They tap the link on their iPhone.
 *  3. This endpoint validates + consumes the token, then streams the binary
 *     .shortcut file back.
 *  4. iOS intercepts the file and opens Shortcuts — the user just taps
 *     "Add Shortcut." No manual configuration required.
 *
 * Token lifecycle:
 *  - Tokens live in the `setup_tokens` table (created by this migration).
 *  - Once consumed they cannot be replayed, so forwarding the link is harmless.
 */

import { Router, Request, Response } from 'express';

import { query } from '../db/client.js';
import { config } from '../config.js';
import { generateShortcut } from './shortcut-generator.js';

export const setupRouter = Router();

// ─── GET /setup/shortcut?token=<token> ───────────────────────────────────────
setupRouter.get('/setup/shortcut', async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token as string | undefined)?.trim();

  // 1. Token must be present
  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  // 2. Look up the token
  const result = await query<{
    id: string;
    sms_api_key: string;
    server_url: string;
    used_at: string | null;
    expires_at: string;
  }>(
    `SELECT id, sms_api_key, server_url, used_at, expires_at
       FROM setup_tokens
      WHERE token = $1`,
    [token],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Invalid token' });
    return;
  }

  const row = result.rows[0];

    // 3. Reject already-used tokens — but allow a 10-minute grace window
    // to handle email clients pre-fetching the link before the user taps it
    if (row.used_at !== null) {
      const usedAt = new Date(row.used_at);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      if (usedAt < tenMinutesAgo) {
        res.status(410).json({ error: 'This link has already been used' });
        return;
      }
      // within grace window — fall through and serve the shortcut again
    }

  // 4. Reject expired tokens
  if (new Date(row.expires_at) < new Date()) {
    res.status(410).json({ error: 'This link has expired' });
    return;
  }

    // 5. Mark as consumed only if not already — if already used within grace
    // window, skip the update and just serve the file
    if (row.used_at === null) {
      await query(
        `UPDATE setup_tokens
            SET used_at = NOW()
      WHERE id = $1
        AND used_at IS NULL`,
    [row.id],
  );
}

  // 6. Generate the pre-filled .shortcut binary
  const smsApiKey = row.sms_api_key || config.smsApiKey;
  const serverUrl  = row.server_url  || config.webhookDomain;

  let shortcutBuffer: Buffer;
  try {
    shortcutBuffer = generateShortcut({ smsApiKey, serverUrl });
  } catch (err) {
    console.error('[setup/shortcut] Failed to generate shortcut:', err);
    res.status(500).json({ error: 'Failed to generate shortcut file' });
    return;
  }

  // 7. Stream the binary back with the MIME type iOS recognises
  res.setHeader('Content-Type', 'application/x-apple-aspen-config');
  res.setHeader('Content-Disposition', 'attachment; filename="Sika.shortcut"');
  res.setHeader('Content-Length', shortcutBuffer.length);
  res.end(shortcutBuffer);
});

export default setupRouter;

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
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="Sika.shortcut"');
  res.setHeader('Content-Length', shortcutBuffer.length);
  res.end(shortcutBuffer);
});

// ─── GET /setup/android?token=<token> ─────────────────────────────────────────
setupRouter.get('/setup/android', async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token as string | undefined)?.trim();

  if (!token) {
    res.status(400).send('<h2>Missing setup token</h2>');
    return;
  }

  const result = await query<{
    id: string;
    sms_api_key: string;
    server_url: string;
    expires_at: string;
  }>(
    `SELECT id, sms_api_key, server_url, expires_at
       FROM setup_tokens
      WHERE token = $1`,
    [token],
  );

  if (result.rows.length === 0 || new Date(result.rows[0].expires_at) < new Date()) {
    res.status(410).send('<h2>Invalid or expired setup link</h2>');
    return;
  }

  const row = result.rows[0];
  const smsApiKey = row.sms_api_key || config.smsApiKey;
  const baseUrl = (row.server_url || config.webhookDomain || '').replace(/\/+$/, '');
  const webhookUrl = `${baseUrl}/api/sms`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sika Android Setup</title>
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --text: #f8fafc;
      --muted: #94a3b8;
      --code-bg: #090d16;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 20px;
      display: flex;
      justify-content: center;
    }
    .container {
      max-width: 540px;
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 28px;
      margin: 0 0 8px 0;
      background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header p {
      color: var(--muted);
      margin: 0;
      font-size: 15px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .card h2 {
      font-size: 18px;
      margin-top: 0;
      margin-bottom: 12px;
      color: #a5b4fc;
    }
    .field-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 6px;
      font-weight: 600;
    }
    .input-group {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .code-box {
      flex: 1;
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
      font-family: monospace;
      font-size: 13px;
      color: #38bdf8;
      word-break: break-all;
    }
    .copy-btn {
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0 16px;
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
      white-space: nowrap;
    }
    .copy-btn:hover { background: var(--primary-hover); }
    .step-list {
      padding-left: 20px;
      margin: 0;
    }
    .step-list li {
      margin-bottom: 10px;
      line-height: 1.5;
      font-size: 14px;
    }
    pre {
      background: var(--code-bg);
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      overflow-x: auto;
      border: 1px solid var(--border);
      color: #a7f3d0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🤖 Android SMS Setup</h1>
      <p>Configure MacroDroid or Tasker to automatically forward bank SMS to Sika.</p>
    </div>

    <div class="card">
      <h2>🔑 Your Connection Details</h2>
      
      <div class="field-label">Webhook URL</div>
      <div class="input-group">
        <div class="code-box" id="url">${webhookUrl}</div>
        <button class="copy-btn" onclick="copyText('url')">Copy</button>
      </div>

      <div class="field-label">SMS API Key</div>
      <div class="input-group">
        <div class="code-box" id="key">${smsApiKey}</div>
        <button class="copy-btn" onclick="copyText('key')">Copy</button>
      </div>
    </div>

    <div class="card">
      <h2>⚡ Option A: MacroDroid Setup</h2>
      <ol class="step-list">
        <li>Install <b>MacroDroid</b> from Google Play Store.</li>
        <li>Create a new Macro:
          <ul>
            <li><b>Trigger:</b> SMS Received → Any Number (or specify bank senders)</li>
            <li><b>Action:</b> HTTP Request (POST)</li>
          </ul>
        </li>
        <li>Set HTTP Request details:
          <ul>
            <li><b>URL:</b> <code>${webhookUrl}</code></li>
            <li><b>Header:</b> <code>Authorization: Bearer ${smsApiKey}</code></li>
            <li><b>Content-Type:</b> <code>application/json</code></li>
          </ul>
        </li>
        <li>Set JSON Request Body:</li>
      </ol>
      <pre>{\n  "sms_body": "{sms_message}",\n  "sender": "{sms_number}"\n}</pre>
    </div>

    <div class="card">
      <h2>⚙️ Option B: Tasker Setup</h2>
      <ol class="step-list">
        <li><b>Profile:</b> Event → Phone → Received Text.</li>
        <li><b>Task:</b> Add Action → HTTP Request:
          <ul>
            <li><b>Method:</b> POST</li>
            <li><b>URL:</b> <code>${webhookUrl}</code></li>
            <li><b>Headers:</b> <code>Authorization: Bearer ${smsApiKey}</code></li>
            <li><b>Body:</b> <code>{"sms_body": "%SMSRB", "sender": "%SMSRF"}</code></li>
          </ul>
        </li>
      </ol>
    </div>
  </div>

  <script>
    function copyText(id) {
      const text = document.getElementById(id).innerText;
      navigator.clipboard.writeText(text).then(() => {
        alert('Copied to clipboard!');
      });
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

export default setupRouter;


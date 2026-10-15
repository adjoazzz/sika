/**
 * setup/router.ts
 *
 * Setup pages that hand each user their own webhook URL + SMS API key.
 *
 *   GET /setup/ios?token=...       Step-by-step iPhone automation guide (no file import needed)
 *   GET /setup/android?token=...   MacroDroid / Tasker guide
 *   GET /setup/shortcut?token=...  Generated .shortcut file (unsigned, see shortcut-generator.ts)
 *
 * `token` is the one-time setup token created when the user signs up. For emails
 * sent before this fix, the user's Telegram link code is accepted as well, so old
 * links keep working.
 */

import { Router, Request, Response } from 'express';

import { query } from '../db/client.js';
import { config } from '../config.js';
import { generateShortcut } from './shortcut-generator.js';

export const setupRouter = Router();

interface SetupCredentials {
  smsApiKey: string;
  baseUrl: string;
  tokenId: string | null;
  usedAt: string | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isTunnel(baseUrl: string): boolean {
  return /\.loca\.lt(\/|$)/.test(baseUrl);
}

/** Look the token up in setup_tokens, then fall back to a users.link_code (old emails). */
async function loadCredentials(token: string): Promise<SetupCredentials | 'expired' | null> {
  const tokenResult = await query<{
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

  if (tokenResult.rows.length > 0) {
    const row = tokenResult.rows[0];
    if (new Date(row.expires_at) < new Date()) return 'expired';
    return {
      smsApiKey: row.sms_api_key || config.smsApiKey,
      baseUrl: (row.server_url || config.webhookDomain || '').replace(/\/+$/, ''),
      tokenId: row.id,
      usedAt: row.used_at,
    };
  }

  const userResult = await query<{ sms_api_key: string }>(
    'SELECT sms_api_key FROM users WHERE link_code = $1',
    [token],
  );
  if (userResult.rows.length > 0) {
    return {
      smsApiKey: userResult.rows[0].sms_api_key,
      baseUrl: (config.webhookDomain || '').replace(/\/+$/, ''),
      tokenId: null,
      usedAt: null,
    };
  }

  return null;
}

const PAGE_CSS = `
  :root { --bg:#0f172a; --card:#1e293b; --border:#334155; --primary:#6366f1; --primary-hover:#4f46e5; --text:#f8fafc; --muted:#94a3b8; --code-bg:#090d16; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--text); margin:0; padding:20px; display:flex; justify-content:center; }
  .container { max-width:540px; width:100%; }
  .header { text-align:center; margin-bottom:24px; }
  .header h1 { font-size:28px; margin:0 0 8px 0; background:linear-gradient(135deg,#818cf8 0%,#c084fc 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .header p { color:var(--muted); margin:0; font-size:15px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:20px; margin-bottom:20px; }
  .card h2 { font-size:18px; margin-top:0; margin-bottom:12px; color:#a5b4fc; }
  .field-label { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted); margin-bottom:6px; font-weight:600; }
  .input-group { display:flex; gap:8px; margin-bottom:16px; }
  .code-box { flex:1; background:var(--code-bg); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-family:monospace; font-size:13px; color:#38bdf8; word-break:break-all; }
  .copy-btn { background:var(--primary); color:#fff; border:none; border-radius:8px; padding:0 16px; font-weight:600; cursor:pointer; font-size:13px; white-space:nowrap; }
  .copy-btn:hover { background:var(--primary-hover); }
  .step-list { padding-left:20px; margin:0; }
  .step-list li { margin-bottom:10px; line-height:1.5; font-size:14px; }
  .warn { background:#422006; border:1px solid #a16207; color:#fde68a; border-radius:12px; padding:12px 14px; font-size:13px; line-height:1.5; margin-bottom:20px; }
  pre { background:var(--code-bg); padding:12px; border-radius:8px; font-size:12px; overflow-x:auto; border:1px solid var(--border); color:#a7f3d0; }
`;

const COPY_SCRIPT = `
  function copyText(id) {
    const text = document.getElementById(id).innerText;
    navigator.clipboard.writeText(text).then(() => { alert('Copied to clipboard!'); });
  }
`;

function credentialsCard(webhookUrl: string, smsApiKey: string): string {
  return `
    <div class="card">
      <h2>🔑 Your Connection Details</h2>
      <div class="field-label">Webhook URL</div>
      <div class="input-group">
        <div class="code-box" id="url">${escapeHtml(webhookUrl)}</div>
        <button class="copy-btn" onclick="copyText('url')">Copy</button>
      </div>
      <div class="field-label">SMS API Key</div>
      <div class="input-group">
        <div class="code-box" id="key">${escapeHtml(smsApiKey)}</div>
        <button class="copy-btn" onclick="copyText('key')">Copy</button>
      </div>
    </div>`;
}

function tunnelWarning(baseUrl: string): string {
  if (!isTunnel(baseUrl)) return '';
  return `
    <div class="warn">
      ⚠️ This server is reachable through a temporary localtunnel address. Requests that don't send the
      header <code>bypass-tunnel-reminder: true</code> can get an HTML warning page instead of reaching Sika,
      and the address changes whenever the tunnel restarts. Add that header below, and move to a permanent
      HTTPS domain when you can.
    </div>`;
}

function pageShell(title: string, subtitle: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </div>
    ${body}
  </div>
  <script>${COPY_SCRIPT}</script>
</body>
</html>`;
}

function sendCredentialError(res: Response, result: null | 'expired'): void {
  const message = result === 'expired' ? 'This setup link has expired' : 'Invalid setup link';
  res.status(result === 'expired' ? 410 : 404).send(`<h2>${message}</h2>`);
}

// ─── GET /setup/ios?token=<token> ────────────────────────────────────────────
setupRouter.get('/setup/ios', async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token as string | undefined)?.trim();
  if (!token) {
    res.status(400).send('<h2>Missing setup token</h2>');
    return;
  }

  const creds = await loadCredentials(token);
  if (creds === null || creds === 'expired') {
    sendCredentialError(res, creds);
    return;
  }

  const webhookUrl = `${creds.baseUrl}/api/sms`;
  const tunnelHeaderStep = isTunnel(creds.baseUrl)
    ? '<li>Add a third header: <code>bypass-tunnel-reminder</code> = <code>true</code></li>'
    : '';

  const body = `
    ${credentialsCard(webhookUrl, creds.smsApiKey)}
    ${tunnelWarning(creds.baseUrl)}
    <div class="card">
      <h2>📱 Step 1: Build the shortcut</h2>
      <ol class="step-list">
        <li>Open <b>Shortcuts</b> → <b>+</b> → name it <b>Sika SMS Forward</b>.</li>
        <li>Add the action <b>Get Contents of URL</b>.</li>
        <li>URL: paste the Webhook URL above. Tap <b>Show More</b> and set Method to <b>POST</b>.</li>
        <li>Headers (add two):
          <ul>
            <li><code>Authorization</code> = <code>Bearer </code> followed by your API key (note the space)</li>
            <li><code>Content-Type</code> = <code>application/json</code></li>
            ${tunnelHeaderStep}
          </ul>
        </li>
        <li>Request Body: <b>JSON</b>. Add two <b>Text</b> fields:
          <ul>
            <li><code>sms_body</code> → tap the value, choose <b>Shortcut Input</b>, then tap it again and pick <b>Content</b></li>
            <li><code>sender</code> → <b>Shortcut Input</b> → <b>Sender</b></li>
          </ul>
        </li>
      </ol>
    </div>
    <div class="card">
      <h2>⚡ Step 2: Trigger it on every SMS</h2>
      <ol class="step-list">
        <li>Shortcuts → <b>Automation</b> → <b>+</b> → <b>Message</b>.</li>
        <li>Sender: pick your bank / MoMo senders (or leave it empty for every message).</li>
        <li>Choose <b>Run Immediately</b> so it doesn't ask each time, and turn off notifications.</li>
        <li>Action: <b>Run Shortcut</b> → <b>Sika SMS Forward</b>, with the message as input.</li>
      </ol>
    </div>
    <div class="card">
      <h2>✅ Step 3: Test it</h2>
      <ol class="step-list">
        <li>Send yourself a test SMS from a sender the automation matches.</li>
        <li>Open the Shortcuts app → Automation and check the last run. If it failed, the error is shown there.</li>
        <li>A <code>401</code> means the API key or <code>Bearer </code> prefix is wrong. A <code>400</code> means the body isn't being sent as JSON.</li>
      </ol>
    </div>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(pageShell('🍎 iPhone SMS Setup', 'Forward bank SMS to Sika with a Shortcuts automation.', body));
});

// ─── GET /setup/shortcut?token=<token> ───────────────────────────────────────
// Serves a generated (unsigned) shortcut file. Most iPhones will only import this
// after it has been signed; /setup/ios works without any file.
setupRouter.get('/setup/shortcut', async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token as string | undefined)?.trim();

  if (!token) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  const creds = await loadCredentials(token);
  if (creds === null) {
    res.status(404).json({ error: 'Invalid token' });
    return;
  }
  if (creds === 'expired') {
    res.status(410).json({ error: 'This link has expired' });
    return;
  }

  // Already-used tokens get a 10-minute grace window so email clients that
  // pre-fetch links don't burn the token before the user taps it.
  if (creds.usedAt !== null) {
    const usedAt = new Date(creds.usedAt);
    if (usedAt < new Date(Date.now() - 10 * 60 * 1000)) {
      res.status(410).json({ error: 'This link has already been used' });
      return;
    }
  } else if (creds.tokenId) {
    await query('UPDATE setup_tokens SET used_at = NOW() WHERE id = $1 AND used_at IS NULL', [creds.tokenId]);
  }

  let shortcutBuffer: Buffer;
  try {
    shortcutBuffer = generateShortcut({ smsApiKey: creds.smsApiKey, serverUrl: creds.baseUrl });
  } catch (err) {
    console.error('[setup/shortcut] Failed to generate shortcut:', err);
    res.status(500).json({ error: 'Failed to generate shortcut file' });
    return;
  }

  res.setHeader('Content-Type', 'application/vnd.apple.shortcut');
  res.setHeader('Content-Disposition', 'attachment; filename="Sika.shortcut"');
  res.setHeader('Content-Length', shortcutBuffer.length);
  res.end(shortcutBuffer);
});

// ─── GET /setup/android?token=<token> ────────────────────────────────────────
setupRouter.get('/setup/android', async (req: Request, res: Response): Promise<void> => {
  const token = (req.query.token as string | undefined)?.trim();
  if (!token) {
    res.status(400).send('<h2>Missing setup token</h2>');
    return;
  }

  const creds = await loadCredentials(token);
  if (creds === null || creds === 'expired') {
    sendCredentialError(res, creds);
    return;
  }

  const webhookUrl = `${creds.baseUrl}/api/sms`;
  const key = escapeHtml(creds.smsApiKey);
  const url = escapeHtml(webhookUrl);
  const tunnelHeader = isTunnel(creds.baseUrl)
    ? '<li><b>Header:</b> <code>bypass-tunnel-reminder: true</code></li>'
    : '';

  const body = `
    ${credentialsCard(webhookUrl, creds.smsApiKey)}
    ${tunnelWarning(creds.baseUrl)}
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
            <li><b>URL:</b> <code>${url}</code></li>
            <li><b>Header:</b> <code>Authorization: Bearer ${key}</code></li>
            <li><b>Content-Type:</b> <code>application/json</code></li>
            ${tunnelHeader}
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
            <li><b>URL:</b> <code>${url}</code></li>
            <li><b>Headers:</b> <code>Authorization: Bearer ${key}</code></li>
            <li><b>Body:</b> <code>{"sms_body": "%SMSRB", "sender": "%SMSRF"}</code></li>
          </ul>
        </li>
      </ol>
    </div>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(pageShell('🤖 Android SMS Setup', 'Configure MacroDroid or Tasker to forward bank SMS to Sika.', body));
});

export default setupRouter;

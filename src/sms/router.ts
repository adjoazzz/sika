import { Router } from 'express';

import { config } from '../config.js';
import { query } from '../db/client.js';
import { computeSmsHash } from './dedup.js';
import { classifySms, parseSms } from './parser.js';
import { detectTransfer } from '../transfers/matcher.js';
import { checkBudgetThresholds } from '../budgets/service.js';
import { notifyUnparsed } from './notifications.js';
import { bot } from '../telegram/bot.js';
import { ownerChatId, resolveChatId } from '../utils/chat.js';

export const smsRouter = Router();

async function logAudit(smsBody: string, sender: string | undefined, receivedAt: string, status: string, transactionId?: string, error?: string): Promise<void> {
  try {
    await query(
      `INSERT INTO sms_audit_log (sms_body, sender, received_at, status, transaction_id, error)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [smsBody, sender ?? null, receivedAt, status, transactionId ?? null, error ?? null],
    );
  } catch (err) {
    // The audit log must never take the request down with it
    console.error('[sms] Failed to write audit log:', err);
  }
}

interface SmsUser {
  telegramChatId: string | null;
}

/**
 * Resolve who an API key belongs to.
 *  - A row in `users` (multi-user / paid onboarding flow)
 *  - Otherwise the owner's own `smsApiKey` from config (self-hosted single user)
 */
async function findUser(apiKey: string): Promise<SmsUser | null> {
  const userResult = await query<{ id: string; telegram_chat_id: string | null }>(
    'SELECT id, telegram_chat_id FROM users WHERE sms_api_key = $1',
    [apiKey],
  );
  if (userResult.rows.length > 0) {
    return { telegramChatId: userResult.rows[0].telegram_chat_id };
  }

  if (config.smsApiKey && apiKey === config.smsApiKey) {
    return { telegramChatId: ownerChatId() };
  }

  return null;
}

smsRouter.post('/api/sms', async (req, res) => {
  const body = (req.body ?? {}) as { sms_body?: unknown; sender?: unknown; received_at?: unknown };
  const smsBody = typeof body.sms_body === 'string' ? body.sms_body : '';
  const sender = typeof body.sender === 'string' ? body.sender : undefined;

  let receivedAt = new Date().toISOString();
  if (body.received_at) {
    const parsedReceived = new Date(String(body.received_at));
    if (!Number.isNaN(parsedReceived.getTime())) receivedAt = parsedReceived.toISOString();
  }

  try {
    const apiKey = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();

    if (!apiKey) {
      await logAudit(smsBody, sender, receivedAt, 'unauthorized', undefined, 'Missing Authorization header');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await findUser(apiKey);
    if (!user) {
      await logAudit(smsBody, sender, receivedAt, 'unauthorized', undefined, 'API key does not match any user');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const telegramChatId = resolveChatId(user.telegramChatId);

    if (!smsBody) {
      const hint = req.body === undefined
        ? 'No JSON body received (is the Content-Type header application/json?)'
        : 'Missing sms_body';
      await logAudit('', sender, receivedAt, 'invalid', undefined, hint);
      res.status(400).json({ error: hint });
      return;
    }

    // Step 1: Classify the SMS
    let classification;
    try {
      classification = await classifySms(smsBody);
    } catch (err) {
      console.error('[sms] Classification failed, assuming transaction:', err);
      classification = { type: 'transaction' as const, balance: null, source: 'unknown' };
    }

    // Handle balance checks
    if (classification.type === 'balance_check') {
      if (classification.balance !== null) {
        await query(
          `INSERT INTO balance_snapshots (source, balance, raw_sms) VALUES ($1, $2, $3)`,
          [classification.source, classification.balance, smsBody],
        );
      }
      await logAudit(smsBody, sender, receivedAt, 'balance_check');
      res.status(200).json({ status: 'balance_check', balance: classification.balance, source: classification.source });
      return;
    }

    // Handle non-financial SMS
    if (classification.type === 'other') {
      await logAudit(smsBody, sender, receivedAt, 'skipped', undefined, 'Non-financial SMS');
      res.status(200).json({ status: 'skipped' });
      return;
    }

    // Step 2: Check for duplicates.
    // A row that previously failed to parse is not a real duplicate: retry it
    // instead of ignoring the SMS forever.
    const smsHash = computeSmsHash(smsBody, receivedAt);

    const existing = await query<{ id: string; category: string }>(
      'SELECT id, category FROM transactions WHERE sms_hash = $1',
      [smsHash],
    );
    const retryRow = existing.rows[0]?.category === 'unparsed' ? existing.rows[0] : undefined;
    if (existing.rows.length > 0 && !retryRow) {
      await logAudit(smsBody, sender, receivedAt, 'duplicate', existing.rows[0].id);
      res.status(200).json({ status: 'duplicate', id: existing.rows[0].id });
      return;
    }

    // Step 3: Parse the transaction
    const overridesResult = await query<{ merchant: string; new_category: string }>(
      'SELECT DISTINCT ON (merchant) merchant, new_category FROM category_overrides ORDER BY merchant, created_at DESC',
    );

    let parsed;
    try {
      parsed = await parseSms(smsBody, overridesResult.rows);
    } catch (err) {
      console.error('[sms] Parsing failed:', err);
      let unparsedId = retryRow?.id;
      if (!unparsedId) {
        // notified_at is set so the notification poller ignores this row;
        // the user gets the dedicated "unparsed" alert below instead.
        const inserted = await query<{ id: string }>(
          `INSERT INTO transactions (raw_sms, sms_hash, amount, currency, direction, type, category, source, sender, transaction_date, notify_chat_id, notified_at)
           VALUES ($1, $2, 0, $3, 'debit', 'expense', 'unparsed', $4, $5, $6, $7, NOW())
           RETURNING id`,
          [smsBody, smsHash, config.currency, sender || 'unknown', sender, receivedAt, telegramChatId],
        );
        unparsedId = inserted.rows[0].id;
      }
      await logAudit(smsBody, sender, receivedAt, 'unparsed', unparsedId, err instanceof Error ? err.message : 'Parse failed');
      notifyUnparsed(smsBody, sender, telegramChatId).catch((e) => console.error('[sms] Unparsed alert failed:', e));
      res.status(200).json({ status: 'unparsed', id: unparsedId });
      return;
    }

    const type = parsed.direction === 'credit' ? 'income' : 'expense';
    const parsedDate = new Date(parsed.transaction_date);
    const transactionDate = parsedDate.getFullYear() >= 2025 ? parsed.transaction_date : receivedAt;

    let transactionId: string;
    if (retryRow) {
      await query(
        `UPDATE transactions
            SET amount = $2, currency = $3, direction = $4, type = $5, merchant = $6,
                category = $7, source = $8, sender = $9, transaction_date = $10,
                notify_chat_id = $11, notified_at = NULL, created_at = NOW()
          WHERE id = $1`,
        [retryRow.id, parsed.amount, config.currency, parsed.direction, type, parsed.merchant, parsed.category, parsed.source, sender, transactionDate, telegramChatId],
      );
      transactionId = retryRow.id;
    } else {
      // notified_at stays NULL: the notification poller sends the Telegram
      // message ~2 minutes later (after transfer matching) and survives restarts.
      const result = await query<{ id: string }>(
        `INSERT INTO transactions (raw_sms, sms_hash, amount, currency, direction, type, merchant, category, source, sender, transaction_date, notify_chat_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [smsBody, smsHash, parsed.amount, config.currency, parsed.direction, type, parsed.merchant, parsed.category, parsed.source, sender, transactionDate, telegramChatId],
      );
      transactionId = result.rows[0].id;
    }

    await detectTransfer(transactionId);

    // Budget alert goes to this user's Telegram chat
    checkBudgetThresholds(parsed.category).then((alert) => {
      if (alert && telegramChatId) {
        bot.telegram.sendMessage(telegramChatId, alert).catch(console.error);
      }
    }).catch(console.error);

    await logAudit(smsBody, sender, receivedAt, 'created', transactionId);
    res.status(201).json({ status: 'created', id: transactionId });
  } catch (err) {
    console.error('[sms] Unhandled error:', err);
    await logAudit(smsBody, sender, receivedAt, 'error', undefined, err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Internal error' });
  }
});

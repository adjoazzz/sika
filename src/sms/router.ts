import { Router } from 'express';

import { config } from '../config.js';
import { query } from '../db/client.js';
import { computeSmsHash } from './dedup.js';
import { classifySms, parseSms } from './parser.js';
import { detectTransfer } from '../transfers/matcher.js';
import { checkBudgetThresholds } from '../budgets/service.js';
import { notifyUnparsed, notifyNewTransaction } from './notifications.js';
import { bot } from '../telegram/bot.js';

export const smsRouter = Router();

async function logAudit(smsBody: string, sender: string | undefined, receivedAt: string, status: string, transactionId?: string, error?: string): Promise<void> {
  await query(
    `INSERT INTO sms_audit_log (sms_body, sender, received_at, status, transaction_id, error)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [smsBody, sender, receivedAt, status, transactionId ?? null, error ?? null],
  );
}

smsRouter.post('/api/sms', async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');

  if (!apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Look up the user by their unique sms_api_key
  const userResult = await query<{ id: string; telegram_chat_id: string | null }>(
    'SELECT id, telegram_chat_id FROM users WHERE sms_api_key = $1',
    [apiKey],
  );

  if (userResult.rows.length === 0) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = userResult.rows[0];
  const telegramChatId = user.telegram_chat_id;

  const { sms_body, sender } = req.body;
  const received_at = req.body.received_at
    ? new Date(req.body.received_at).toISOString()
    : new Date().toISOString();

  if (!sms_body) {
    await logAudit(sms_body || '', sender, received_at, 'invalid', undefined, 'Missing sms_body');
    res.status(400).json({ error: 'Missing sms_body' });
    return;
  }

  // Step 1: Classify the SMS
  let classification;
  try {
    classification = await classifySms(sms_body);
  } catch {
    classification = { type: 'transaction' as const, balance: null, source: 'unknown' };
  }

  // Handle balance checks
  if (classification.type === 'balance_check') {
    if (classification.balance !== null) {
      await query(
        `INSERT INTO balance_snapshots (source, balance, raw_sms) VALUES ($1, $2, $3)`,
        [classification.source, classification.balance, sms_body],
      );
    }
    await logAudit(sms_body, sender, received_at, 'balance_check');
    res.status(200).json({ status: 'balance_check', balance: classification.balance, source: classification.source });
    return;
  }

  // Handle non-financial SMS
  if (classification.type === 'other') {
    await logAudit(sms_body, sender, received_at, 'skipped', undefined, 'Non-financial SMS');
    res.status(200).json({ status: 'skipped' });
    return;
  }

  // Step 2: Check for duplicates
  const smsHash = computeSmsHash(sms_body, received_at);

  const existing = await query(
    'SELECT id FROM transactions WHERE sms_hash = $1',
    [smsHash],
  );
  if (existing.rows.length > 0) {
    await logAudit(sms_body, sender, received_at, 'duplicate', existing.rows[0].id);
    res.status(200).json({ status: 'duplicate', id: existing.rows[0].id });
    return;
  }

  // Step 3: Parse the transaction
  const overridesResult = await query<{ merchant: string; new_category: string }>(
    'SELECT DISTINCT ON (merchant) merchant, new_category FROM category_overrides ORDER BY merchant, created_at DESC',
  );

  let parsed;
  try {
    parsed = await parseSms(sms_body, overridesResult.rows);
  } catch (err) {
    const result = await query(
      `INSERT INTO transactions (raw_sms, sms_hash, amount, currency, direction, type, category, source, sender, transaction_date)
       VALUES ($1, $2, 0, $3, 'debit', 'expense', 'unparsed', $4, $5, $6)
       RETURNING id`,
      [sms_body, smsHash, config.currency, sender || 'unknown', sender, received_at],
    );
    await logAudit(sms_body, sender, received_at, 'unparsed', result.rows[0].id, err instanceof Error ? err.message : 'Parse failed');
    notifyUnparsed(sms_body, sender).catch(console.error);
    res.status(200).json({ status: 'unparsed', id: result.rows[0].id });
    return;
  }

  const type = parsed.direction === 'credit' ? 'income' : 'expense';
  const parsedDate = new Date(parsed.transaction_date);
  const transactionDate = parsedDate.getFullYear() >= 2025 ? parsed.transaction_date : received_at;

  const result = await query(
    `INSERT INTO transactions (raw_sms, sms_hash, amount, currency, direction, type, merchant, category, source, sender, transaction_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [sms_body, smsHash, parsed.amount, config.currency, parsed.direction, type, parsed.merchant, parsed.category, parsed.source, sender, transactionDate],
  );

  const transactionId = result.rows[0].id;

  await detectTransfer(transactionId);

  // Send budget alert to this specific user's Telegram
  checkBudgetThresholds(parsed.category).then(alert => {
    if (alert && telegramChatId) {
      bot.telegram.sendMessage(telegramChatId, alert).catch(console.error);
    }
  }).catch(console.error);

  // Send transaction notification to this specific user
  setTimeout(() => {
    notifyNewTransaction(transactionId, telegramChatId ?? undefined).catch(console.error);
  }, 2 * 60 * 1000);

  await logAudit(sms_body, sender, received_at, 'created', transactionId);
  res.status(201).json({ status: 'created', id: transactionId });
});
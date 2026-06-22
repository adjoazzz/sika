import { bot } from '../telegram/bot.js';
import { config } from '../config.js';
import { query } from '../db/client.js';
import { fmtAmount, esc } from '../utils/format.js';

export async function notifyUnparsed(smsBody: string, sender: string | undefined, telegramChatId?: string): Promise<void> {
  const chatId = telegramChatId ?? config.telegramChatId;
  const preview = smsBody.length > 200 ? smsBody.slice(0, 200) + '...' : smsBody;
  const msg = `⚠️ *Unparsed SMS*\n\nFrom: ${sender || 'Unknown'}\n\n\`${preview}\`\n\nThis message couldn't be parsed. Use /fix to categorize it manually.`;
  await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}

export async function notifyNewTransaction(transactionId: string, telegramChatId?: string): Promise<void> {
  const chatId = telegramChatId ?? config.telegramChatId;

  const result = await query<{
    amount: number;
    direction: string;
    type: string;
    merchant: string;
    category: string;
    source: string;
  }>(
    'SELECT amount, direction, type, merchant, category, source FROM transactions WHERE id = $1',
    [transactionId],
  );

  if (result.rows.length === 0) return;
  const txn = result.rows[0];

  // Skip transfers — avoid noisy notifications for internal moves
  if (txn.type === 'transfer') return;

  const arrow = txn.direction === 'credit' ? '🟢 Received' : '🔴 Spent';
  const msg = `${arrow} *${fmtAmount(Number(txn.amount))}*\n${esc(txn.merchant || 'Unknown')} — ${esc(txn.category)}\nvia ${esc(txn.source)}`;

  await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}
import { query } from '../db/client.js';

export async function scheduleReminder(
  type: string,
  chatId: string,
  delayMs: number,
): Promise<void> {
  const sendAfter = new Date(Date.now() + delayMs);
  await query(
    `INSERT INTO pending_reminders (type, chat_id, send_after)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [type, chatId, sendAfter],
  );
}

export async function cancelPendingReminders(
  type: string,
  chatId: string,
): Promise<void> {
  await query(
    `UPDATE pending_reminders
     SET sent = TRUE
     WHERE type = $1 AND chat_id = $2 AND sent = FALSE`,
    [type, chatId],
  );
}

export async function flushDueReminders(
  handler: (type: string, chatId: string) => Promise<void>,
): Promise<void> {
  const result = await query<{ id: string; type: string; chat_id: string }>(
    `UPDATE pending_reminders
     SET sent = TRUE
     WHERE sent = FALSE AND send_after <= NOW()
     RETURNING id, type, chat_id`,
  );
  for (const row of result.rows) {
    try {
      await handler(row.type, row.chat_id);
    } catch (err) {
      console.error(`[reminders] failed to fire ${row.type} for ${row.chat_id}:`, err);
    }
  }
}
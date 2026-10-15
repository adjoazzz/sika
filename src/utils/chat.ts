import { config } from '../config.js';

const PLACEHOLDER = /^(REPLACE|YOUR|CHANGE|XXX)/i;

/** The owner's chat ID from config, or null if it is empty or still a placeholder. */
export function ownerChatId(): string | null {
  const id = String(config.telegramChatId ?? '').trim();
  if (!id || PLACEHOLDER.test(id)) return null;
  return id;
}

/**
 * Which Telegram chat should get a message for this user?
 * Prefer the user's linked chat; fall back to the owner chat from config.
 * Returns null when neither is usable, so callers can skip instead of
 * firing a request at Telegram that is guaranteed to fail.
 */
export function resolveChatId(userChatId?: string | null): string | null {
  const id = userChatId?.trim();
  if (id) return id;
  return ownerChatId();
}

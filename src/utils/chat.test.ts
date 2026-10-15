import { describe, it, expect, vi, beforeEach } from 'vitest';

const cfg = vi.hoisted(() => ({ telegramChatId: 'REPLACE_WITH_TELEGRAM_CHAT_ID' as string }));
vi.mock('../config.js', () => ({ config: cfg }));

import { ownerChatId, resolveChatId } from './chat.js';

describe('chat id resolution', () => {
  beforeEach(() => {
    cfg.telegramChatId = 'REPLACE_WITH_TELEGRAM_CHAT_ID';
  });

  it('treats the placeholder from the example config as unset', () => {
    expect(ownerChatId()).toBeNull();
    expect(resolveChatId(null)).toBeNull();
    expect(resolveChatId(undefined)).toBeNull();
  });

  it('prefers the linked user chat', () => {
    cfg.telegramChatId = '111';
    expect(resolveChatId('222')).toBe('222');
  });

  it('falls back to the owner chat when the user is not linked', () => {
    cfg.telegramChatId = '111';
    expect(resolveChatId(null)).toBe('111');
    expect(resolveChatId('  ')).toBe('111');
  });
});

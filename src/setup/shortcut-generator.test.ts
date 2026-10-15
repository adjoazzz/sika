import { describe, it, expect } from 'vitest';

import { generateShortcut } from './shortcut-generator.js';

describe('generateShortcut', () => {
  it('produces a binary plist with the endpoint and bearer key embedded', () => {
    const buf = generateShortcut({ smsApiKey: 'abc123', serverUrl: 'https://example.com/' });
    expect(buf.subarray(0, 8).toString('ascii')).toBe('bplist00');
    const text = buf.toString('latin1');
    expect(text).toContain('https://example.com/api/sms');
    expect(text).toContain('Bearer abc123');
    expect(text).not.toContain('getlatestmessages');
  });

  it('adds the localtunnel bypass header only for loca.lt URLs', () => {
    const tunnel = generateShortcut({ smsApiKey: 'k', serverUrl: 'https://x.loca.lt' }).toString('latin1');
    const normal = generateShortcut({ smsApiKey: 'k', serverUrl: 'https://example.com' }).toString('latin1');
    expect(tunnel).toContain('bypass-tunnel-reminder');
    expect(normal).not.toContain('bypass-tunnel-reminder');
  });
});

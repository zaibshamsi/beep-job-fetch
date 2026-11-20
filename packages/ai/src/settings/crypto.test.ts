import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, getMasterKey, maskKey, resetMasterKeyCache } from './crypto.ts';

describe('AES-256-GCM secrets', () => {
  const key = randomBytes(32);

  it('round-trips and never stores plaintext', () => {
    const enc = encryptSecret('sk-live-abcdef123456', key);
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('abcdef');
    expect(decryptSecret(enc, key)).toBe('sk-live-abcdef123456');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSecret('same', key)).not.toBe(encryptSecret('same', key));
  });

  it('rejects tampering and the wrong key', () => {
    const enc = encryptSecret('secret-value', key);
    const buf = Buffer.from(enc.slice(3), 'base64');
    buf[buf.length - 1] ^= 1;
    expect(() => decryptSecret('v1:' + buf.toString('base64'), key)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
    expect(() => decryptSecret('plain', key)).toThrow();
  });

  it('handles unicode', () => {
    expect(decryptSecret(encryptSecret('₹ कुंजी', key), key)).toBe('₹ कुंजी');
  });
});

describe('master key', () => {
  const saved = process.env.APP_SECRET;
  afterEach(() => {
    if (saved === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = saved;
    resetMasterKeyCache();
  });

  it('derives a stable 32-byte key from APP_SECRET', () => {
    process.env.APP_SECRET = 'my-passphrase';
    resetMasterKeyCache();
    const a = getMasterKey();
    resetMasterKeyCache();
    expect(a.length).toBe(32);
    expect(getMasterKey().equals(a)).toBe(true);
  });
});

describe('maskKey', () => {
  it('shows first 3 and last 4 characters', () => {
    expect(maskKey('sk-abcdefghij1234')).toBe('sk-...1234');
  });
  it('hides short keys entirely', () => {
    expect(maskKey('short')).toBe('***');
  });
});

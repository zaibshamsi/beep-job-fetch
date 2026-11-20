import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/ai/src/settings -> repo root
const REPO_ROOT = path.resolve(here, '../../../..');
const KEY_FILE = path.join(REPO_ROOT, '.secrets', 'app.key');
const PREFIX = 'v1:';

let cachedKey: Buffer | null = null;

/**
 * 32-byte master key. APP_SECRET wins (hashed to 32 bytes so any string works);
 * otherwise a random key is generated once and kept in .secrets/app.key (gitignored).
 */
export function getMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv) {
    cachedKey = createHash('sha256').update(fromEnv).digest();
    return cachedKey;
  }
  if (!existsSync(KEY_FILE)) {
    mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    try {
      // 'wx' so two processes racing on first use cannot overwrite each other's key
      writeFileSync(KEY_FILE, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  cachedKey = Buffer.from(readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  if (cachedKey.length !== 32) {
    cachedKey = null;
    throw new Error(`Invalid master key in ${KEY_FILE}: expected 32 bytes of hex`);
  }
  return cachedKey;
}

export function resetMasterKeyCache(): void {
  cachedKey = null;
}

/** AES-256-GCM. Output: "v1:" + base64(iv[12] | authTag[16] | ciphertext). */
export function encryptSecret(plain: string, key: Buffer = getMasterKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

/** Throws when the value is malformed or the key is wrong (GCM auth failure). */
export function decryptSecret(payload: string, key: Buffer = getMasterKey()): string {
  if (!payload.startsWith(PREFIX)) throw new Error('Not an encrypted value');
  const buf = Buffer.from(payload.slice(PREFIX.length), 'base64');
  if (buf.length < 29) throw new Error('Encrypted value is too short');
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
}

/** "sk-abcdef123456" -> "sk-...3456". Short keys are fully hidden. */
export function maskKey(key: string): string {
  return key.length <= 8 ? '***' : `${key.slice(0, 3)}...${key.slice(-4)}`;
}

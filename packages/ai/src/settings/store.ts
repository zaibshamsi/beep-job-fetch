import { exec, query } from '@beep/shared';
import { decryptSecret, encryptSecret } from './crypto.ts';

export const SETTING_KEYS = {
  jev: { apiKey: 'jev.apiKey', model: 'jev.model' },
  llm: {
    apiKey: 'llm.apiKey',
    endpoint: 'llm.endpoint',
    deployment: 'llm.deployment',
    apiVersion: 'llm.apiVersion',
    model: 'llm.model',
  },
} as const;

const SECRET_KEYS = new Set<string>([SETTING_KEYS.jev.apiKey, SETTING_KEYS.llm.apiKey]);

/** Reads all jev.* / llm.* settings, decrypting secrets. An undecryptable secret (master key changed) is treated as unset. */
export async function readAllSettings(): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>(
    `SELECT [key] AS [key], value FROM app_settings WHERE [key] LIKE 'jev.%' OR [key] LIKE 'llm.%'`,
  );
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (!SECRET_KEYS.has(r.key)) {
      out[r.key] = r.value;
      continue;
    }
    try {
      out[r.key] = decryptSecret(r.value);
    } catch {
      // wrong or missing master key: behave as "no key saved" instead of crashing the pipeline
    }
  }
  return out;
}

export async function writeSetting(key: string, value: string): Promise<void> {
  const stored = SECRET_KEYS.has(key) ? encryptSecret(value) : value;
  await exec(
    `MERGE app_settings AS t USING (SELECT @key AS [key], @value AS value) AS s ON t.[key] = s.[key]
     WHEN MATCHED THEN UPDATE SET value = s.value, updated_at = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT ([key], value) VALUES (s.[key], s.value);`,
    { key, value: stored },
  );
}

export async function deleteSettings(keys: string[]): Promise<void> {
  for (const key of keys) await exec(`DELETE FROM app_settings WHERE [key] = @key`, { key });
}

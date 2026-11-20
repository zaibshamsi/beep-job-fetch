import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closePool, exec, query } from '../db.ts';
import { createLogger } from '../logger.ts';

const log = createLogger('migrate');
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../db/migrations');

async function main() {
  await exec(`IF OBJECT_ID('schema_migrations') IS NULL
    CREATE TABLE schema_migrations (name NVARCHAR(200) PRIMARY KEY, applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME())`);
  const applied = new Set((await query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    log.info(`applying ${f}`);
    const sqlText = await readFile(path.join(dir, f), 'utf8');
    // split on GO batch separators
    const batches = sqlText.split(/^\s*GO\s*$/gim).map((b) => b.trim()).filter(Boolean);
    for (const b of batches) await exec(b);
    await exec('INSERT INTO schema_migrations(name) VALUES (@name)', { name: f });
  }
  log.info('migrations up to date');
}

main()
  .catch((e) => {
    log.error('migration failed', e);
    process.exitCode = 1;
  })
  .finally(closePool);

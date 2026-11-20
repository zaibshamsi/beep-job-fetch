import { closePool, exec, query } from '../db.ts';
import { createLogger } from '../logger.ts';
import { decodeEntities } from '../util.ts';

const log = createLogger('fix-entities');

/** One-off repair: descriptions saved before entity decoding was added still contain things like "&mdash;". */
async function main() {
  const rows = await query<{ id: number; description: string }>(
    `SELECT id, description FROM jobs WHERE description LIKE '%&%;%'`,
  );
  let fixed = 0;
  for (const r of rows) {
    const next = decodeEntities(r.description);
    if (next !== r.description) {
      await exec('UPDATE jobs SET description = @d WHERE id = @id', { d: next, id: r.id });
      fixed++;
    }
  }
  log.info(`checked ${rows.length} descriptions, repaired ${fixed}`);
}

main()
  .catch((e) => {
    log.error('failed', e);
    process.exitCode = 1;
  })
  .finally(closePool);

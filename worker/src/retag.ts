import { closePool, createLogger, query } from '@beep/shared';
import { aiConfigured, listRetagCandidates, retagJobs, selectRetag, type RetagMode } from './pipeline/retag.ts';
import { activeRunId } from './pipeline/runs-repo.ts';
import { loadAdapters } from './sources/registry.ts';

/**
 * Re-enriches jobs already in the database; no fetching. Saves tag columns and cities only.
 *   npm run retag -w worker                  flagged jobs (needs_review = 1)
 *   npm run retag -w worker -- --all         every active job
 *   npm run retag -w worker -- --limit 500   cap the number of jobs, oldest first
 */
const log = createLogger('retag');
const args = process.argv.slice(2);
const mode: RetagMode = args.includes('--all') ? 'all' : 'needs-review';
const limitAt = args.indexOf('--limit');
const limit = limitAt >= 0 ? Number(args[limitAt + 1]) || undefined : undefined;

const perSource = () =>
  query<{ source: string; active: number; fresher: number }>(
    `SELECT primary_source AS source, COUNT(*) AS active, SUM(CAST(is_fresher AS INT)) AS fresher
     FROM jobs WHERE status = 'active' GROUP BY primary_source ORDER BY primary_source`,
  );

let code = 0;
try {
  const running = await activeRunId();
  if (running !== null) {
    log.error(`pipeline run ${running} is active; try again when it finishes`);
    code = 1;
  } else {
    const known = await listRetagCandidates();
    const ids = selectRetag(known, { mode, aiConfigured: await aiConfigured(), limit });
    log.info(`${known.length} active jobs; re-tagging ${ids.length} (${mode})`);
    const before = await perSource();
    const adapters = new Map((await loadAdapters()).map((a) => [a.name, a]));
    const sum = await retagJobs(ids, new Map(known.map((k) => [k.id, k])), { adapters });
    const after = await perSource();
    console.log(JSON.stringify({ mode, ...sum }, null, 2));
    console.table(
      after.map((a) => ({
        source: a.source,
        active: a.active,
        'fresher before': before.find((b) => b.source === a.source)?.fresher ?? 0,
        'fresher after': a.fresher,
      })),
    );
  }
} catch (e) {
  log.error('retag failed', e);
  code = 1;
} finally {
  await closePool().catch(() => undefined);
}
process.exit(code);

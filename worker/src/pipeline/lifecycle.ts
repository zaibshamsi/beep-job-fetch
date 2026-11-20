import { query, type RunStats } from '@beep/shared';
import { inList } from './util.ts';

export const EXPIRE_AFTER_MISSED_RUNS = 3;

/**
 * Sources whose absence of a job means something: they ran, did not error and returned posts.
 * An empty-but-successful fetch is treated as unknown, because a source that silently returns
 * nothing would otherwise age out all of its jobs.
 */
export function sourcesFetchedOk(perSource: RunStats['perSource']): string[] {
  return Object.entries(perSource)
    .filter(([, s]) => !s.error && !s.skipped && s.fetched > 0)
    .map(([name]) => name);
}

/**
 * A job counts as missed only if every source that lists it was fetched OK this run and none of them saw it.
 * Jobs with any source that errored, was skipped or returned nothing are left alone.
 * Returns how many jobs became expired.
 */
export async function runLifecycle(runId: number, okSources: string[]): Promise<number> {
  if (!okSources.length) return 0;
  const { sql, params } = inList('s', okSources);
  const allSourcesChecked = `
    EXISTS (SELECT 1 FROM job_sources js WHERE js.job_id = j.id AND js.source IN (${sql}))
    AND NOT EXISTS (SELECT 1 FROM job_sources js WHERE js.job_id = j.id AND js.source NOT IN (${sql}))`;
  const rows = await query<{ n: number }>(
    `UPDATE j SET missed_runs = j.missed_runs + 1
     FROM jobs j
     WHERE j.status = 'active'
       AND j.last_seen_at < (SELECT started_at FROM pipeline_runs WHERE id = @runId)
       AND ${allSourcesChecked};

     UPDATE j SET status = 'expired'
     FROM jobs j
     WHERE j.status = 'active' AND j.missed_runs >= @limit AND ${allSourcesChecked};
     SELECT @@ROWCOUNT AS n;`,
    { runId, limit: EXPIRE_AFTER_MISSED_RUNS, ...params },
  );
  return Number(rows[0]?.n ?? 0);
}

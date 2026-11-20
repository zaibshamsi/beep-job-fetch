import { useStats } from '../../api/queries.ts';
import { formatDateTime, formatNumber, formatRelative } from './format.ts';
import { useNow } from './hooks.ts';

/** "589 roles · 10 sources · refreshed 14 hours ago", all from GET /stats. */
export function FactLine() {
  const stats = useStats(5 * 60_000);
  const now = useNow();
  const s = stats.data;

  if (!s) {
    return (
      <p className="mp-meta" aria-busy={stats.isPending || undefined}>
        {stats.isError ? 'Job counts are unavailable right now.' : <span className="mp-skel" style={{ width: 260, height: 14 }} />}
      </p>
    );
  }

  const sources = s.sources.filter((x) => x.activeJobs > 0).length;
  const finished = s.lastRun?.finishedAt ?? null;
  return (
    <p className="mp-meta">
      <b>{formatNumber(s.totals.activeJobs)}</b> {s.totals.activeJobs === 1 ? 'role' : 'roles'} <span aria-hidden="true">·</span> {formatNumber(sources)}&nbsp;
      {sources === 1 ? 'source' : 'sources'}
      {finished && (
        <>
          {' '}
          <span aria-hidden="true">·</span> refreshed{' '}
          <time dateTime={finished} title={formatDateTime(finished)}>
            {formatRelative(finished, now)}
          </time>
        </>
      )}
    </p>
  );
}

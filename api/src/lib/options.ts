import { JOB_TYPES, query, WORK_MODES } from '@beep/shared';

const ACTIVE = `j.status = 'active' AND j.is_fresher = 1`;

/** Posted-within choices offered by the filter panel, with how many active posts each would keep. */
export const POSTED_RANGES = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
] as const;

const countOf = (rows: { key: string | null; count: number }[], key: string) => Number(rows.find((r) => r.key === key)?.count ?? 0);

/** Everything the UI filter panel needs, counted over active fresher posts. */
export async function filterOptions() {
  const [roles, cities, jobTypes, workModes, sources, posted] = await Promise.all([
    query<{ role: string; count: number }>(
      `SELECT j.role_category AS role, COUNT(*) AS count FROM jobs j WHERE ${ACTIVE} AND j.role_category IS NOT NULL
       GROUP BY j.role_category ORDER BY count DESC, j.role_category`,
    ),
    query<{ city: string; state: string; count: number }>(
      `SELECT c.name AS city, c.state, COUNT(DISTINCT j.id) AS count
       FROM jobs j JOIN job_cities jc ON jc.job_id = j.id JOIN cities c ON c.id = jc.city_id
       WHERE ${ACTIVE} GROUP BY c.name, c.state ORDER BY count DESC, c.name`,
    ),
    query<{ key: string | null; count: number }>(`SELECT j.job_type AS [key], COUNT(*) AS count FROM jobs j WHERE ${ACTIVE} GROUP BY j.job_type`),
    query<{ key: string | null; count: number }>(`SELECT j.work_mode AS [key], COUNT(*) AS count FROM jobs j WHERE ${ACTIVE} GROUP BY j.work_mode`),
    query<{ source: string; count: number }>(
      `SELECT js.source, COUNT(DISTINCT j.id) AS count FROM jobs j JOIN job_sources js ON js.job_id = j.id
       WHERE ${ACTIVE} GROUP BY js.source ORDER BY count DESC, js.source`,
    ),
    query<{ days: number; count: number }>(
      `SELECT d.days, COUNT(*) AS count FROM (VALUES ${POSTED_RANGES.map((r) => `(${r.days})`).join(',')}) AS d(days)
       JOIN jobs j ON COALESCE(j.posted_at, j.first_seen_at) >= DATEADD(day, -d.days, SYSUTCDATETIME())
       WHERE ${ACTIVE} GROUP BY d.days`,
    ),
  ]);
  const num = <T extends { count: number }>(rows: T[]) => rows.map((r) => ({ ...r, count: Number(r.count) }));
  return {
    roles: num(roles),
    cities: num(cities),
    jobTypes: JOB_TYPES.map((value) => ({ value, count: countOf(jobTypes, value) })),
    workModes: WORK_MODES.map((value) => ({ value, count: countOf(workModes, value) })),
    sources: num(sources),
    postedRanges: POSTED_RANGES.map((r) => ({ ...r, count: Number(posted.find((p) => Number(p.days) === r.days)?.count ?? 0) })),
  };
}

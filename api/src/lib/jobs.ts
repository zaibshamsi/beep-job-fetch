import { query, REMOTE, type JobFilters } from '@beep/shared';
import { buildJobWhere, buildOrderBy, type SortMode } from './filters.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const SNIPPET_LEN = 240;
const TOP_ROLES = 5;

export interface JobSourceLink {
  source: string;
  applyUrl: string;
}

export interface JobListItem {
  id: number;
  title: string;
  company: string;
  cities: string[];
  locationRaw: string | null;
  roleCategory: string | null;
  jobType: string | null;
  workMode: string | null;
  stipendMinMonthlyInr: number | null;
  stipendMaxMonthlyInr: number | null;
  skills: string[];
  postedAt: string | null;
  firstSeenAt: string;
  isNew: boolean;
  sources: JobSourceLink[];
  snippet: string;
}

export interface JobDetail extends JobListItem {
  description: string;
  status: string;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  needsReview: boolean;
  confidence: number | null;
  taggedBy: Record<string, string>;
  promptVersion: string | null;
  employmentTypeRaw: string | null;
  compensationRaw: string | null;
}

export interface RoleCount {
  role: string;
  count: number;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

const snippetOf = (description: string | null) => (description ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LEN);

// Only the head of the description is needed for the snippet, so the list never ships the full text.
const LIST_COLUMNS = `j.id, j.title, j.company, j.location_raw, j.role_category, j.job_type, j.work_mode,
  j.stipend_min_monthly_inr, j.stipend_max_monthly_inr, j.skills, j.posted_at, j.first_seen_at,
  j.primary_source, j.apply_url, LEFT(j.description, ${SNIPPET_LEN * 2}) AS description_head`;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Load cities and source links for a set of job ids (ids come from the DB, but still go as params). */
async function loadRelations(ids: number[]) {
  const cities = new Map<number, string[]>();
  const sources = new Map<number, JobSourceLink[]>();
  if (ids.length === 0) return { cities, sources };
  const params: Record<string, unknown> = {};
  const ph = ids.map((id, i) => {
    params[`id${i}`] = id;
    return `@id${i}`;
  });
  const [cityRows, sourceRows] = await Promise.all([
    query<{ job_id: number; name: string }>(
      `SELECT jc.job_id, c.name FROM job_cities jc JOIN cities c ON c.id = jc.city_id WHERE jc.job_id IN (${ph.join(',')}) ORDER BY c.name`,
      params,
    ),
    query<{ job_id: number; source: string; apply_url: string }>(
      `SELECT job_id, source, apply_url FROM job_sources WHERE job_id IN (${ph.join(',')}) ORDER BY id`,
      params,
    ),
  ]);
  for (const r of cityRows) push(cities, Number(r.job_id), r.name);
  for (const r of sourceRows) push(sources, Number(r.job_id), { source: r.source, applyUrl: r.apply_url });
  return { cities, sources };
}

function toListItem(r: Record<string, any>, cities: string[], sources: JobSourceLink[], now = Date.now()): JobListItem {
  const firstSeen = new Date(r.first_seen_at);
  return {
    id: Number(r.id),
    title: r.title,
    company: r.company,
    cities,
    locationRaw: r.location_raw ?? null,
    roleCategory: r.role_category ?? null,
    jobType: r.job_type ?? null,
    workMode: r.work_mode ?? null,
    stipendMinMonthlyInr: r.stipend_min_monthly_inr ?? null,
    stipendMaxMonthlyInr: r.stipend_max_monthly_inr ?? null,
    skills: parseJson<string[]>(r.skills, []),
    postedAt: iso(r.posted_at),
    firstSeenAt: firstSeen.toISOString(),
    isNew: now - firstSeen.getTime() < DAY_MS,
    // The primary source always has a link even if job_sources was not populated.
    sources: sources.length ? sources : [{ source: r.primary_source, applyUrl: r.apply_url }],
    snippet: snippetOf(r.description_head),
  };
}

export async function listJobs(filters: JobFilters, page: number, pageSize: number, sort: SortMode) {
  const { where, params, tokens } = buildJobWhere(filters);
  const [{ total }] = await query<{ total: number }>(`SELECT COUNT(*) AS total FROM jobs j WHERE ${where}`, params);
  const rows = await query(
    `SELECT ${LIST_COLUMNS} FROM jobs j WHERE ${where}
     ORDER BY ${buildOrderBy(sort, tokens)}
     OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY`,
    { ...params, offset: (page - 1) * pageSize, pageSize },
  );
  const { cities, sources } = await loadRelations(rows.map((r) => Number(r.id)));
  const now = Date.now();
  const items = rows.map((r) => toListItem(r, cities.get(Number(r.id)) ?? [], sources.get(Number(r.id)) ?? [], now));
  return { items, total: Number(total), page, pageSize };
}

export async function getJob(id: number): Promise<JobDetail | null> {
  const rows = await query(`SELECT j.*, LEFT(j.description, ${SNIPPET_LEN * 2}) AS description_head FROM jobs j WHERE j.id = @id`, { id });
  const r = rows[0];
  if (!r) return null;
  const { cities, sources } = await loadRelations([id]);
  return {
    ...toListItem(r, cities.get(id) ?? [], sources.get(id) ?? []),
    description: r.description ?? '',
    status: r.status,
    experienceMinYears: r.exp_min_years ?? null,
    experienceMaxYears: r.exp_max_years ?? null,
    needsReview: !!r.needs_review,
    confidence: r.confidence ?? null,
    taggedBy: parseJson<Record<string, string>>(r.tagged_by, {}),
    promptVersion: r.prompt_version ?? null,
    employmentTypeRaw: r.employment_type_raw ?? null,
    compensationRaw: r.compensation_raw ?? null,
  };
}

const topRoles = (counts: Map<string, number>): RoleCount[] =>
  [...counts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role))
    .slice(0, TOP_ROLES);

/** Per-city counts for the map, using the same filter path as listJobs. */
export async function citiesSummary(filters: JobFilters) {
  const { where, params } = buildJobWhere(filters);

  // A city filter narrows the jobs; it must also narrow the columns, or a multi-city job would light up every city it lists.
  const cityNames = (filters.cities ?? []).filter((c) => c.toLowerCase() !== REMOTE.toLowerCase());
  const cityParams: Record<string, unknown> = {};
  const cityClause = cityNames.length
    ? ` AND c.name IN (${cityNames
        .map((n, i) => {
          cityParams[`sc${i}`] = n;
          return `@sc${i}`;
        })
        .join(', ')})`
    : '';

  const [cityRows, remoteRows, unlocated] = await Promise.all([
    query<{ city: string; state: string; lat: number; lng: number; role: string | null; n: number }>(
      `SELECT c.name AS city, c.state, c.lat, c.lng, j.role_category AS role, COUNT(DISTINCT j.id) AS n
       FROM jobs j JOIN job_cities jc ON jc.job_id = j.id JOIN cities c ON c.id = jc.city_id
       WHERE ${where}${cityClause}
       GROUP BY c.name, c.state, c.lat, c.lng, j.role_category`,
      { ...params, ...cityParams },
    ),
    query<{ role: string | null; n: number }>(
      `SELECT j.role_category AS role, COUNT(*) AS n FROM jobs j WHERE ${where} AND j.work_mode = 'remote' GROUP BY j.role_category`,
      params,
    ),
    query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM jobs j WHERE ${where}
       AND (j.work_mode IS NULL OR j.work_mode <> 'remote')
       AND NOT EXISTS (SELECT 1 FROM job_cities jc WHERE jc.job_id = j.id)`,
      params,
    ),
  ]);

  const byCity = new Map<string, { city: string; state: string; lat: number; lng: number; count: number; roles: Map<string, number> }>();
  for (const r of cityRows) {
    const e = byCity.get(r.city) ?? { city: r.city, state: r.state, lat: r.lat, lng: r.lng, count: 0, roles: new Map() };
    const n = Number(r.n);
    const role = r.role ?? 'Other';
    e.count += n;
    e.roles.set(role, (e.roles.get(role) ?? 0) + n);
    byCity.set(r.city, e);
  }
  const cities = [...byCity.values()]
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
    .map(({ roles, ...c }) => ({ ...c, topRoles: topRoles(roles) }));

  const remoteRoles = new Map<string, number>();
  let remoteCount = 0;
  for (const r of remoteRows) {
    remoteCount += Number(r.n);
    remoteRoles.set(r.role ?? 'Other', Number(r.n));
  }
  return {
    cities,
    remote: { count: remoteCount, topRoles: topRoles(remoteRoles) },
    unlocated: { count: Number(unlocated[0]?.n ?? 0) },
  };
}

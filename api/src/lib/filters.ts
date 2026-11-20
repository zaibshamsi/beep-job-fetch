import { z } from 'zod';
import { JOB_TYPES, JobFiltersSchema, REMOTE, ROLE_CATEGORIES, WORK_MODES, type JobFilters } from '@beep/shared';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;
const MAX_TOKENS = 10;
const MAX_TOKEN_LEN = 80;
const MAX_CITIES = 20;

// ---------- query-string parsing ----------

/** Query params arrive as string | string[]; blanks mean "not set". */
const last = (v: unknown) => (Array.isArray(v) ? v[v.length - 1] : v);
const blankToUndefined = (v: unknown) => (last(v) === '' ? undefined : last(v));
const single = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(blankToUndefined, schema.optional());
const flag = z.preprocess((v) => {
  const x = last(v);
  if (x === 'true' || x === '1') return true;
  if (x === 'false' || x === '0') return false;
  return x === '' ? undefined : x;
}, z.boolean().optional());
const list = z.preprocess(
  (v) => (v === undefined ? undefined : (Array.isArray(v) ? v : [v]).filter((s) => s !== '')),
  z.array(z.string().max(80)).max(MAX_CITIES).optional(),
);

export const JobsQuerySchema = z.object({
  q: single(z.string().max(300)),
  role: single(z.enum(ROLE_CATEGORIES)),
  city: list,
  jobType: single(z.enum(JOB_TYPES)),
  workMode: single(z.enum(WORK_MODES)),
  stipendMin: single(z.coerce.number().min(0).max(10_000_000)),
  postedWithinDays: single(z.coerce.number().int().min(1).max(3650)),
  source: single(z.string().max(60)),
  isNew: flag,
  page: single(z.coerce.number().int().min(1).max(100_000)),
  pageSize: single(z.coerce.number().int().min(1).max(MAX_PAGE_SIZE)),
  sort: single(z.enum(['newest', 'relevance'])),
});

export type SortMode = 'newest' | 'relevance';
export interface ParsedJobsQuery {
  filters: JobFilters;
  page: number;
  pageSize: number;
  sort: SortMode;
}

/** Validate raw query params (req.query) into filters + paging. Throws ZodError on bad input. */
export function parseJobsQuery(raw: unknown): ParsedJobsQuery {
  const q = JobsQuerySchema.parse(raw ?? {});
  const filters = JobFiltersSchema.parse({
    q: q.q,
    roleCategory: q.role,
    cities: q.city,
    jobType: q.jobType,
    workMode: q.workMode,
    stipendMin: q.stipendMin,
    postedWithinDays: q.postedWithinDays,
    source: q.source,
    isNew: q.isNew,
  });
  return { filters, page: q.page ?? 1, pageSize: q.pageSize ?? DEFAULT_PAGE_SIZE, sort: q.sort ?? 'newest' };
}

// ---------- SQL building (pure; values only ever travel as @params) ----------

/** Escape LIKE wildcards. Pair with `ESCAPE '\'`. */
export const escapeLike = (s: string) => s.replace(/[\\%_[\]]/g, '\\$&');

/** Every whitespace-separated token of q and keywords must appear, so tokens are the unit of matching. */
export function searchTokens(filters: JobFilters): string[] {
  const words = [filters.q ?? '', ...(filters.keywords ?? [])].join(' ').split(/\s+/);
  const seen = new Set<string>();
  for (const w of words) {
    const t = w.trim().toLowerCase().slice(0, MAX_TOKEN_LEN);
    if (t) seen.add(t);
  }
  return [...seen].slice(0, MAX_TOKENS);
}

export interface SqlFragment {
  where: string;
  params: Record<string, unknown>;
  tokens: string[];
}

/** WHERE clause for active fresher jobs matching the filters. `a` is the jobs table alias. */
export function buildJobWhere(filters: JobFilters, a = 'j'): SqlFragment {
  const clauses = [`${a}.status = 'active'`, `${a}.is_fresher = 1`];
  const params: Record<string, unknown> = {};

  const tokens = searchTokens(filters);
  tokens.forEach((t, i) => {
    params[`q${i}`] = `%${escapeLike(t)}%`;
    clauses.push(`${a}.search_text LIKE @q${i} ESCAPE '\\'`);
  });

  if (filters.roleCategory) {
    params.role = filters.roleCategory;
    clauses.push(`${a}.role_category = @role`);
  }

  if (filters.cities?.length) {
    const wantsRemote = filters.cities.some((c) => c.toLowerCase() === REMOTE.toLowerCase());
    const names = filters.cities.filter((c) => c.toLowerCase() !== REMOTE.toLowerCase());
    const parts: string[] = [];
    if (names.length) {
      const ph = names.map((n, i) => {
        params[`city${i}`] = n;
        return `@city${i}`;
      });
      parts.push(
        `EXISTS (SELECT 1 FROM job_cities jc JOIN cities c ON c.id = jc.city_id WHERE jc.job_id = ${a}.id AND c.name IN (${ph.join(', ')}))`,
      );
    }
    if (wantsRemote) parts.push(`${a}.work_mode = 'remote'`);
    clauses.push(`(${parts.join(' OR ')})`);
  }

  if (filters.jobType) {
    params.jobType = filters.jobType;
    clauses.push(`${a}.job_type = @jobType`);
  }
  if (filters.workMode) {
    params.workMode = filters.workMode;
    clauses.push(`${a}.work_mode = @workMode`);
  }
  if (filters.stipendMin != null) {
    params.stipendMin = filters.stipendMin;
    // A range qualifies when its top end reaches the minimum.
    clauses.push(`COALESCE(${a}.stipend_max_monthly_inr, ${a}.stipend_min_monthly_inr) >= @stipendMin`);
  }
  if (filters.postedWithinDays != null) {
    params.postedDays = filters.postedWithinDays;
    clauses.push(`COALESCE(${a}.posted_at, ${a}.first_seen_at) >= DATEADD(day, -@postedDays, SYSUTCDATETIME())`);
  }
  if (filters.source) {
    params.source = filters.source;
    clauses.push(`(${a}.primary_source = @source OR EXISTS (SELECT 1 FROM job_sources js WHERE js.job_id = ${a}.id AND js.source = @source))`);
  }
  if (filters.isNew) clauses.push(`${a}.first_seen_at >= DATEADD(hour, -24, SYSUTCDATETIME())`);

  return { where: clauses.join(' AND '), params, tokens };
}

/** ORDER BY for the list. Relevance weights a token hit in the title over company over the rest. */
export function buildOrderBy(sort: SortMode, tokens: string[], a = 'j'): string {
  const newest = `COALESCE(${a}.posted_at, ${a}.first_seen_at) DESC, ${a}.id DESC`;
  if (sort !== 'relevance' || tokens.length === 0) return newest;
  const score = tokens
    .map((_, i) => `(CASE WHEN ${a}.title LIKE @q${i} ESCAPE '\\' THEN 3 ELSE 0 END + CASE WHEN ${a}.company LIKE @q${i} ESCAPE '\\' THEN 2 ELSE 0 END)`)
    .join(' + ');
  return `(${score}) DESC, ${newest}`;
}

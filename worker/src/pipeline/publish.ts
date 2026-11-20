import { query, REMOTE, type JobPost, type Enrichment } from '@beep/shared';
import pLimit from 'p-limit';
import type { Touch } from './dedupe.ts';
import type { Enriched, SourceLink } from './types.ts';
import { errMsg } from './util.ts';

type Params = Record<string, unknown>;

/** Lower-cased text the API's LIKE search runs against. */
export function buildSearchText(post: JobPost, e: Enrichment): string {
  return [post.title, post.company, e.roleCategory, ...e.cities, ...e.skills, post.locationRaw]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

const toInt = (n: number | null) => (n === null ? null : Math.round(n));

/** Column values shared by INSERT and UPDATE of a job row. */
export function jobParams(item: Enriched): Params {
  const { cand, enrichment: e } = item;
  const p = cand.post;
  return {
    title: p.title,
    company: p.company,
    companyNorm: cand.companyNorm,
    titleNorm: cand.titleNorm,
    description: p.description,
    locationRaw: p.locationRaw || null,
    employmentTypeRaw: p.employmentTypeRaw,
    compensationRaw: p.compensationRaw,
    postedAt: p.postedAt,
    roleCategory: e.roleCategory,
    jobType: e.jobType,
    workMode: e.workMode,
    isFresher: e.isFresher ? 1 : 0,
    expMin: e.experienceMinYears,
    expMax: e.experienceMaxYears,
    stipMin: toInt(e.stipendMinMonthlyInr),
    stipMax: toInt(e.stipendMaxMonthlyInr),
    skills: JSON.stringify(e.skills),
    confidence: e.confidence,
    needsReview: item.needsReview ? 1 : 0,
    taggedBy: JSON.stringify(item.provenance),
    promptVersion: item.promptVersion,
    contentHash: cand.contentHash,
    searchText: buildSearchText(p, e),
  };
}

/** Canonical city names that exist as rows in `cities`; 'Remote' is not a city. */
const realCities = (e: Enrichment) => [...new Set(e.cities.filter((c) => c !== REMOTE))];

function cityInsert(jobIdExpr: string, cities: string[], prefix: string): { sql: string; params: Params } {
  if (!cities.length) return { sql: '', params: {} };
  const params: Params = {};
  const names = cities.map((c, i) => {
    params[`${prefix}${i}`] = c;
    return `@${prefix}${i}`;
  });
  return {
    sql: `INSERT INTO job_cities (job_id, city_id) SELECT ${jobIdExpr}, id FROM cities WHERE name IN (${names.join(', ')});`,
    params,
  };
}

/** Update-or-insert for each source link of a job. Params are namespaced so many can share one batch. */
function linkUpserts(jobIdExpr: string, links: SourceLink[], prefix: string): { sql: string; params: Params } {
  const params: Params = {};
  const parts = links.map((l, i) => {
    const [s, sj, u] = [`${prefix}s${i}`, `${prefix}j${i}`, `${prefix}u${i}`];
    params[s] = l.source;
    params[sj] = l.sourceJobId;
    params[u] = l.applyUrl;
    return (
      `UPDATE job_sources SET last_seen_at = SYSUTCDATETIME(), apply_url = @${u} WHERE source = @${s} AND source_job_id = @${sj}; ` +
      `IF @@ROWCOUNT = 0 INSERT INTO job_sources (job_id, source, source_job_id, apply_url) VALUES (${jobIdExpr}, @${s}, @${sj}, @${u});`
    );
  });
  return { sql: parts.join('\n'), params };
}

const COLS = [
  ['title', 'title'],
  ['company', 'company'],
  ['company_norm', 'companyNorm'],
  ['title_norm', 'titleNorm'],
  ['description', 'description'],
  ['location_raw', 'locationRaw'],
  ['employment_type_raw', 'employmentTypeRaw'],
  ['compensation_raw', 'compensationRaw'],
  ['posted_at', 'postedAt'],
  ['role_category', 'roleCategory'],
  ['job_type', 'jobType'],
  ['work_mode', 'workMode'],
  ['is_fresher', 'isFresher'],
  ['exp_min_years', 'expMin'],
  ['exp_max_years', 'expMax'],
  ['stipend_min_monthly_inr', 'stipMin'],
  ['stipend_max_monthly_inr', 'stipMax'],
  ['skills', 'skills'],
  ['confidence', 'confidence'],
  ['needs_review', 'needsReview'],
  ['tagged_by', 'taggedBy'],
  ['prompt_version', 'promptVersion'],
  ['content_hash', 'contentHash'],
  ['search_text', 'searchText'],
] as const;

const TAG_COLS = new Set([
  'role_category', 'job_type', 'work_mode', 'is_fresher', 'exp_min_years', 'exp_max_years', 'stipend_min_monthly_inr',
  'stipend_max_monthly_inr', 'skills', 'confidence', 'needs_review', 'tagged_by', 'prompt_version', 'search_text',
]);

/** Rewrites only the tag columns and cities of a job. Not a sighting: last_seen_at and missed_runs are left alone. */
export function buildRetagSql(jobId: number, item: Enriched): { sql: string; params: Params } {
  const c = cityInsert('@id', realCities(item.enrichment), 'c');
  const all = jobParams(item);
  const cols = COLS.filter(([col]) => TAG_COLS.has(col));
  const params: Params = { id: jobId, ...c.params };
  for (const [, p] of cols) params[p] = all[p];
  const sets = cols.map(([col, p]) => `${col} = @${p}`).join(', ');
  const sql = `SET XACT_ABORT ON; BEGIN TRAN;
UPDATE jobs SET ${sets} WHERE id = @id;
DELETE FROM job_cities WHERE job_id = @id;
${c.sql}
COMMIT;`;
  return { sql, params };
}

export async function publishRetags(items: { jobId: number; item: Enriched }[], concurrency = 4): Promise<{ saved: number[]; failed: number }> {
  const limit = pLimit(concurrency);
  const saved: number[] = [];
  let failed = 0;
  await Promise.all(
    items.map((u) =>
      limit(async () => {
        try {
          const { sql, params } = buildRetagSql(u.jobId, u.item);
          await query(sql, params);
          saved.push(u.jobId);
        } catch {
          failed++;
        }
      }),
    ),
  );
  return { saved, failed };
}

export function buildInsertSql(item: Enriched): { sql: string; params: Params } {
  const { cand } = item;
  const links = linkUpserts('@id', cand.links, 'l');
  const cities = cityInsert('@id', realCities(item.enrichment), 'c');
  const cols = ['apply_url', 'url_hash', 'primary_source', ...COLS.map(([c]) => c)];
  const vals = ['@applyUrl', '@urlHash', '@primarySource', ...COLS.map(([, p]) => `@${p}`)];
  const sql = `SET XACT_ABORT ON; BEGIN TRAN;
INSERT INTO jobs (${cols.join(', ')}) VALUES (${vals.join(', ')});
DECLARE @id BIGINT = SCOPE_IDENTITY();
${links.sql}
${cities.sql}
COMMIT;
SELECT @id AS id;`;
  return {
    sql,
    params: {
      ...jobParams(item),
      applyUrl: cand.post.applyUrl,
      urlHash: cand.urlHash,
      primarySource: cand.post.source,
      ...links.params,
      ...cities.params,
    },
  };
}

/** Rewrites an existing job whose own source changed its content. Identity (url, first_seen_at) is kept. */
export function buildUpdateSql(jobId: number, item: Enriched, links: SourceLink[]): { sql: string; params: Params } {
  const l = linkUpserts('@id', links, 'l');
  const c = cityInsert('@id', realCities(item.enrichment), 'c');
  const sets = COLS.map(([col, p]) => `${col} = @${p}`).join(', ');
  const sql = `SET XACT_ABORT ON; BEGIN TRAN;
UPDATE jobs SET ${sets}, status = 'active', missed_runs = 0, last_seen_at = SYSUTCDATETIME() WHERE id = @id;
DELETE FROM job_cities WHERE job_id = @id;
${c.sql}
${l.sql}
COMMIT;`;
  return { sql, params: { ...jobParams(item), id: jobId, ...l.params, ...c.params } };
}

/** One batch of "seen again" updates; callers keep batches under the 2100-parameter limit. */
export function buildTouchSql(touches: Touch[]): { sql: string; params: Params } {
  const params: Params = {};
  const stmts = touches.map((t, i) => {
    params[`id${i}`] = t.jobId;
    let setDesc = '';
    if (t.description !== undefined) {
      params[`d${i}`] = t.description;
      setDesc = `, description = @d${i}`;
    }
    const l = linkUpserts(`@id${i}`, t.links, `t${i}_`);
    Object.assign(params, l.params);
    return `UPDATE jobs SET last_seen_at = SYSUTCDATETIME(), missed_runs = 0, status = 'active'${setDesc} WHERE id = @id${i};\n${l.sql}`;
  });
  return { sql: `SET XACT_ABORT ON; BEGIN TRAN;\n${stmts.join('\n')}\nCOMMIT;`, params };
}

export function batchTouches(touches: Touch[], maxParams = 1800): Touch[][] {
  const batches: Touch[][] = [];
  let cur: Touch[] = [];
  let used = 0;
  for (const t of touches) {
    const cost = 2 + t.links.length * 3;
    if (cur.length && used + cost > maxParams) {
      batches.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(t);
    used += cost;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

export interface PublishResult {
  newJobs: number;
  updatedJobs: number;
  failed: { title: string; error: string }[];
}

export async function publishStage(input: {
  inserts: Enriched[];
  updates: { jobId: number; item: Enriched; links: SourceLink[] }[];
  touches: Touch[];
  concurrency?: number;
}): Promise<PublishResult> {
  const limit = pLimit(input.concurrency ?? 4);
  const res: PublishResult = { newJobs: 0, updatedJobs: 0, failed: [] };
  const fail = (title: string, e: unknown) => res.failed.push({ title, error: errMsg(e) });

  await Promise.all([
    ...input.inserts.map((item) =>
      limit(async () => {
        try {
          const { sql, params } = buildInsertSql(item);
          await query(sql, params);
          res.newJobs++;
        } catch (e) {
          fail(item.cand.post.title, e);
        }
      }),
    ),
    ...input.updates.map((u) =>
      limit(async () => {
        try {
          const { sql, params } = buildUpdateSql(u.jobId, u.item, u.links);
          await query(sql, params);
          res.updatedJobs++;
        } catch (e) {
          fail(u.item.cand.post.title, e);
        }
      }),
    ),
    ...batchTouches(input.touches).map((batch) =>
      limit(async () => {
        try {
          const { sql, params } = buildTouchSql(batch);
          await query(sql, params);
          res.updatedJobs += batch.length;
        } catch (e) {
          // one bad link must not hide the rest of the batch: retry them one by one
          for (const t of batch) {
            try {
              const { sql, params } = buildTouchSql([t]);
              await query(sql, params);
              res.updatedJobs++;
            } catch (err) {
              fail(`job ${t.jobId}`, err);
            }
          }
        }
      }),
    ),
  ]);
  return res;
}


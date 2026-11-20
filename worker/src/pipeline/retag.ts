import { getAiStatus, JEV_PROMPT_VERSION, LLM_PROMPT_VERSION } from '@beep/ai';
import { createLogger, query, type JobPost, type SourceAdapter } from '@beep/shared';
import { makeCandidate } from './dedupe.ts';
import { enrichStage, type EnrichFn } from './enrich.ts';
import { publishRetags } from './publish.ts';
import type { Candidate } from './types.ts';
import { chunk, inList } from './util.ts';

const log = createLogger('retag');

// ---------- selection (pure) ----------

export interface RetagCandidate {
  id: number;
  promptVersion: string | null;
  needsReview: boolean;
  isFresher: boolean;
}

export type RetagMode = 'stale' | 'needs-review' | 'all';

/**
 * The graph writes promptVersion as 'rules', 'jev.v1', 'llm.v1' or 'jev.v1+llm.v1'.
 * Anything else (the old stub's 'stub', 'rules-fallback', 'error', NULL, or an older version string) is stale.
 */
const versionParts = (v: string | null) => (v ? v.split('+') : []);
export function isCurrentVersion(v: string | null): boolean {
  const parts = versionParts(v);
  return parts.length > 0 && parts.every((p) => p === 'rules' || p === JEV_PROMPT_VERSION || p === LLM_PROMPT_VERSION);
}
const aiHasRun = (v: string | null) => versionParts(v).some((p) => p === JEV_PROMPT_VERSION || p === LLM_PROMPT_VERSION);

/**
 * A known job is worth re-enriching when its prompt version is not a current one, or when it is flagged for
 * review, no provider has tagged it yet and providers are configured now. The second clause stops a job that
 * stays low-confidence after a real AI pass from being picked again on every run.
 */
export function isStale(job: RetagCandidate, aiConfigured: boolean): boolean {
  if (!isCurrentVersion(job.promptVersion)) return true;
  return aiConfigured && job.needsReview && !aiHasRun(job.promptVersion);
}

/** Ids to re-tag, oldest job first (ids grow with first insert, so successive capped runs converge). */
export function selectRetag(jobs: RetagCandidate[], o: { mode: RetagMode; aiConfigured: boolean; limit?: number }): number[] {
  const pick = (j: RetagCandidate) =>
    o.mode === 'all' ? true : o.mode === 'needs-review' ? j.needsReview : isStale(j, o.aiConfigured);
  const ids = jobs
    .filter(pick)
    .map((j) => j.id)
    .sort((a, b) => a - b);
  return o.limit && o.limit > 0 ? ids.slice(0, o.limit) : ids;
}

export interface RetagSummary {
  retagged: number;
  flippedToNotFresher: number;
  flippedToFresher: number;
  stillNeedsReview: number;
}

export const emptyRetagSummary = (): RetagSummary => ({ retagged: 0, flippedToNotFresher: 0, flippedToFresher: 0, stillNeedsReview: 0 });

export function addToSummary(sum: RetagSummary, before: Pick<RetagCandidate, 'isFresher'>, after: { isFresher: boolean; needsReview: boolean }): void {
  sum.retagged++;
  if (before.isFresher && !after.isFresher) sum.flippedToNotFresher++;
  if (!before.isFresher && after.isFresher) sum.flippedToFresher++;
  if (after.needsReview) sum.stillNeedsReview++;
}

// ---------- DB ----------

export async function aiConfigured(): Promise<boolean> {
  try {
    return (await getAiStatus()).mode !== 'rules_only';
  } catch {
    return false;
  }
}

export async function listRetagCandidates(): Promise<RetagCandidate[]> {
  const rows = await query<{ id: number; prompt_version: string | null; needs_review: boolean; is_fresher: boolean }>(
    "SELECT id, prompt_version, needs_review, is_fresher FROM jobs WHERE status = 'active' ORDER BY id",
  );
  return rows.map((r) => ({
    id: Number(r.id),
    promptVersion: r.prompt_version,
    needsReview: Boolean(r.needs_review),
    isFresher: Boolean(r.is_fresher),
  }));
}

type JobRow = {
  id: number;
  title: string;
  company: string;
  location_raw: string | null;
  description: string | null;
  apply_url: string;
  posted_at: Date | null;
  employment_type_raw: string | null;
  compensation_raw: string | null;
  primary_source: string;
  source_job_id: string;
};

/**
 * Rebuilds the JobPost each stored job came from. The source hint (fresher/internship boards) is not stored on the
 * job, so it is recovered by re-running the adapter's normalize() on the newest raw payload; no network involved.
 */
export async function loadJobPosts(ids: number[], adapters: Map<string, SourceAdapter>): Promise<Map<number, JobPost>> {
  const out = new Map<number, JobPost>();
  for (const part of chunk(ids, 400)) {
    const { sql, params } = inList('i', part);
    const rows = await query<JobRow>(
      `SELECT j.id, j.title, j.company, j.location_raw, j.description, j.apply_url, j.posted_at, j.employment_type_raw,
              j.compensation_raw, j.primary_source,
              (SELECT TOP 1 js.source_job_id FROM job_sources js WHERE js.job_id = j.id AND js.source = j.primary_source ORDER BY js.id) AS source_job_id
       FROM jobs j WHERE j.id IN (${sql})`,
      params,
    );
    const hints = await loadSourceHints(rows, adapters);
    for (const r of rows) {
      out.set(Number(r.id), {
        source: r.primary_source,
        sourceJobId: r.source_job_id ?? String(r.id),
        title: r.title,
        company: r.company,
        locationRaw: r.location_raw ?? '',
        description: r.description ?? '',
        applyUrl: r.apply_url,
        postedAt: r.posted_at,
        employmentTypeRaw: r.employment_type_raw,
        compensationRaw: r.compensation_raw,
        sourceHint: hints.get(Number(r.id)) ?? 'none',
      });
    }
  }
  return out;
}

async function loadSourceHints(rows: JobRow[], adapters: Map<string, SourceAdapter>): Promise<Map<number, JobPost['sourceHint']>> {
  const hints = new Map<number, JobPost['sourceHint']>();
  const bySource = new Map<string, JobRow[]>();
  for (const r of rows) if (r.source_job_id && adapters.has(r.primary_source)) bySource.set(r.primary_source, [...(bySource.get(r.primary_source) ?? []), r]);
  for (const [source, jobs] of bySource) {
    const adapter = adapters.get(source)!;
    for (const part of chunk(jobs, 200)) {
      const { sql, params } = inList('s', part.map((j) => j.source_job_id));
      const raws = await query<{ source_job_id: string; payload: string }>(
        `SELECT source_job_id, payload FROM raw_posts WHERE source = @source AND source_job_id IN (${sql}) ORDER BY id`,
        { source, ...params },
      );
      const newest = new Map(raws.map((r) => [r.source_job_id, r.payload])); // later rows win
      for (const j of part) {
        const payload = newest.get(j.source_job_id);
        if (!payload) continue;
        try {
          const post = adapter.normalize({ source, sourceJobId: j.source_job_id, payload: JSON.parse(payload) });
          if (post?.sourceHint) hints.set(Number(j.id), post.sourceHint);
        } catch {
          // keep 'none': a payload that no longer normalizes just loses the hint
        }
      }
    }
  }
  return hints;
}

// ---------- stage ----------

export interface RetagOptions {
  runId?: number;
  enrich?: EnrichFn;
  adapters: Map<string, SourceAdapter>;
  /** Jobs per enrich+save round; progress is saved after each, so an interrupted run keeps its work. */
  batchSize?: number;
  /** Skip these jobs (e.g. ones the run is already refreshing with new content). */
  exclude?: Set<number>;
}

/** Enriches the given known jobs again (never from the tag cache) and saves only their tag columns. */
export async function retagJobs(ids: number[], before: Map<number, RetagCandidate>, o: RetagOptions): Promise<RetagSummary> {
  const summary = emptyRetagSummary();
  const todo = ids.filter((id) => !o.exclude?.has(id));
  for (const part of chunk(todo, o.batchSize ?? 200)) {
    const posts = await loadJobPosts(part, o.adapters);
    const cands = new Map<number, Candidate>();
    for (const id of part) {
      const post = posts.get(id);
      if (post) cands.set(id, makeCandidate(post, 'unknown', () => []));
    }
    const failed = new Set<Candidate>();
    const res = await enrichStage([...cands.values()], {
      runId: o.runId ?? 0,
      enrich: o.enrich,
      jobIds: new Map([...cands].map(([id, c]) => [c, id])),
      onError: (c, msg) => {
        failed.add(c);
        log.warn(`re-enrich failed for "${c.post.title}", keeping its current tags: ${msg}`);
      },
    });
    const idOf = new Map([...cands].map(([id, c]) => [c, id]));
    const items = res.items.filter((it) => !failed.has(it.cand)).map((item) => ({ jobId: idOf.get(item.cand)!, item }));
    const { saved, failed: saveFailed } = await publishRetags(items);
    if (saveFailed) log.error(`${saveFailed} re-tagged job(s) could not be saved`);
    const savedSet = new Set(saved);
    for (const { jobId, item } of items) {
      if (!savedSet.has(jobId)) continue;
      addToSummary(summary, before.get(jobId) ?? { isFresher: item.enrichment.isFresher }, {
        isFresher: item.enrichment.isFresher,
        needsReview: item.needsReview,
      });
    }
    log.info(`re-tagged ${summary.retagged}/${todo.length}`);
  }
  return summary;
}


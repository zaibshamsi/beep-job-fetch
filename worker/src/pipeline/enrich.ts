import { enrichPost, ruleTag } from '@beep/ai';
import type { EnrichOptions, EnrichResult } from '@beep/ai';
import { EnrichmentSchema, REMOTE, type Enrichment, type FieldProvenance, type JobPost } from '@beep/shared';
import pLimit from 'p-limit';
import type { Candidate, Enriched } from './types.ts';
import { errMsg } from './util.ts';

export type EnrichFn = (post: JobPost, opts?: EnrichOptions) => Promise<EnrichResult>;

/** What an earlier run saved for identical content; lets us skip the providers entirely. */
export interface CachedEnrichment {
  enrichment: Enrichment;
  provenance: FieldProvenance;
  promptVersion: string;
}

export const FALLBACK_PROMPT_VERSION = 'rules-fallback';

/** Rule-only tags, used when the enrichment graph throws or returns something invalid. */
export function ruleOnlyEnrichment(post: JobPost): Enrichment {
  const r = ruleTag(post);
  const workMode = r.workModeHint ?? 'onsite';
  const cities = r.cities.length === 0 && workMode === 'remote' ? [REMOTE] : r.cities;
  return {
    roleCategory: r.roleHint ?? 'Other',
    cities,
    workMode,
    jobType: r.jobTypeHint ?? (post.sourceHint === 'internship' ? 'internship' : 'full_time'),
    isFresher: r.fresher !== 'no',
    experienceMinYears: r.experienceMinYears,
    experienceMaxYears: r.experienceMaxYears,
    stipendMinMonthlyInr: r.stipendMinMonthlyInr,
    stipendMaxMonthlyInr: r.stipendMaxMonthlyInr,
    skills: r.skills.slice(0, 8),
    confidence: Math.min(r.roleConfidence, 0.3),
  };
}

export interface EnrichStageResult {
  items: Enriched[];
  cacheHits: number;
  failures: number;
}

export async function enrichStage(
  cands: Candidate[],
  o: {
    runId: number;
    enrich?: EnrichFn;
    cache?: Map<string, CachedEnrichment>;
    /** Known job ids (refreshes only); new jobs have no id until they are inserted. */
    jobIds?: Map<Candidate, number>;
    concurrency?: number;
    onError?: (cand: Candidate, message: string) => void;
  },
): Promise<EnrichStageResult> {
  const enrich = o.enrich ?? enrichPost;
  const limit = pLimit(o.concurrency ?? 6);
  let cacheHits = 0;
  let failures = 0;

  const items = await Promise.all(
    cands.map((cand) =>
      limit(async (): Promise<Enriched> => {
        const cached = o.cache?.get(cand.contentHash);
        if (cached) {
          cacheHits++;
          return { cand, ...cached, needsReview: false, used: { jev: false, llm: false }, fromCache: true };
        }
        try {
          const res = await enrich(cand.post, { runId: o.runId || undefined, jobId: o.jobIds?.get(cand) });
          const enrichment = EnrichmentSchema.parse(res.enrichment);
          return {
            cand,
            enrichment,
            provenance: res.provenance,
            needsReview: res.needsReview,
            promptVersion: res.promptVersion,
            used: res.used,
            fromCache: false,
          };
        } catch (e) {
          failures++;
          o.onError?.(cand, errMsg(e));
          const enrichment = ruleOnlyEnrichment(cand.post);
          const provenance = Object.fromEntries(Object.keys(enrichment).map((k) => [k, 'rules'])) as FieldProvenance;
          return {
            cand,
            enrichment,
            provenance,
            needsReview: true,
            promptVersion: FALLBACK_PROMPT_VERSION,
            used: { jev: false, llm: false },
            fromCache: false,
          };
        }
      }),
    ),
  );
  return { items, cacheHits, failures };
}

import type { FresherVerdict } from '@beep/ai';
import { emptyStats, type Enrichment, type FieldProvenance, type JobPost, type RunStats } from '@beep/shared';

/** One listing of a job on one source. A job can carry several once duplicates are merged. */
export interface SourceLink {
  source: string;
  sourceJobId: string;
  applyUrl: string;
}

/** A normalized post on its way through dedupe, enrichment and publish. */
export interface Candidate {
  post: JobPost;
  verdict: FresherVerdict;
  urlHash: string;
  companyNorm: string;
  titleNorm: string;
  /** Cities the rules found in the post; only used for fuzzy dedupe. */
  cities: string[];
  /** Fixed at creation (hash of the post's own content), so merging a richer description does not change it. */
  contentHash: string;
  links: SourceLink[];
}

export interface Enriched {
  cand: Candidate;
  enrichment: Enrichment;
  provenance: FieldProvenance;
  needsReview: boolean;
  promptVersion: string;
  /** Which providers ran; both false for rules-only, cache hits and failures. */
  used: { jev: boolean; llm: boolean };
  fromCache: boolean;
}

/** RunStats plus a few worker-only extras; the API ignores unknown JSON keys. */
export interface WorkerStats extends RunStats {
  rejectedSample: string[];
  stageMs: Record<string, number>;
  cacheHits: number;
  enrichFailures: number;
  /** Known jobs re-enriched this run because their tags were stale. */
  retagged: number;
  durationMs: number;
}

export const emptyWorkerStats = (): WorkerStats => ({
  ...emptyStats(),
  rejectedSample: [],
  stageMs: {},
  cacheHits: 0,
  enrichFailures: 0,
  retagged: 0,
  durationMs: 0,
});

export const REJECTED_SAMPLE_CAP = 20;

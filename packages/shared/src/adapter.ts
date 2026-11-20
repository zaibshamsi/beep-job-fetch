import type { Logger } from './logger.ts';
import type { JobPost, RawPost } from './types.ts';

export interface RunContext {
  runId: number;
  log: Logger;
  /** Hard cap each adapter should respect so one source cannot dominate a run. */
  maxPostsPerSource: number;
  signal?: AbortSignal;
}

/** What we learned about a source's rules. Upserted into the `sources` table and shown on the data-health page. */
export interface SourceMeta {
  homepage: string;
  accessMethod: 'official_api' | 'public_ats_api' | 'html' | 'jsonld' | 'feed';
  termsUrl: string | null;
  /** Result of reading the site's terms and robots.txt. Only 'allowed' / 'allowed_with_limits' sources may be enabled. */
  termsStatus: 'allowed' | 'allowed_with_limits' | 'forbidden' | 'unclear';
  /** One or two plain sentences: what we checked, what limits we follow. Goes into the working doc. */
  termsNotes: string;
}

/**
 * Every job source implements this. One file per source (or per family) in worker/src/sources/,
 * exporting `default` as a SourceAdapter or SourceAdapter[]. The registry auto-discovers them.
 * - fetch(): return raw items. Never throw for a single bad item; throw only if the whole source is unusable.
 * - normalize(): map one raw item to the standard JobPost, or null to reject it.
 */
export interface SourceAdapter {
  /** Stable id, used as jobs.source and in logs, e.g. 'greenhouse', 'adzuna'. */
  name: string;
  /** Human description for the stats page. */
  description: string;
  meta: SourceMeta;
  /** Returns a reason string if the source cannot run now (missing key, etc.), else null. */
  unavailableReason(): string | null;
  fetch(ctx: RunContext): Promise<RawPost[]>;
  normalize(raw: RawPost): JobPost | null;
}

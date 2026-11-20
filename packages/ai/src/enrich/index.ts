import { createLogger } from '@beep/shared';
import type { JobPost } from '@beep/shared';
import type { EnrichOptions, EnrichResult } from '../contracts.ts';
import { errorText } from '../providers/log.ts';
import { runEnrichGraph } from './graph.ts';

const log = createLogger('ai:enrich');

/**
 * Single entry point the pipeline calls. Never throws: with no keys it runs rules-only, and any unexpected
 * failure returns an empty, review-flagged result so one bad post cannot stop a run.
 */
export async function enrichPost(post: JobPost, opts: EnrichOptions = {}): Promise<EnrichResult> {
  try {
    return await runEnrichGraph(post, opts);
  } catch (e) {
    log.error(`enrichment failed for "${post.title}": ${errorText(e)}`);
    return {
      enrichment: {
        roleCategory: 'Other',
        cities: [],
        workMode: 'onsite',
        jobType: 'full_time',
        isFresher: true,
        experienceMinYears: null,
        experienceMaxYears: null,
        stipendMinMonthlyInr: null,
        stipendMaxMonthlyInr: null,
        skills: [],
        confidence: 0,
      },
      provenance: {},
      needsReview: true,
      promptVersion: 'error',
      used: { jev: false, llm: false },
    };
  }
}

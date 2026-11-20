import type { EnrichOptions, EnrichResult } from '@beep/ai';
import type { Enrichment, JobPost } from '@beep/shared';
import { describe, expect, it, vi } from 'vitest';
import { enrichStage, FALLBACK_PROMPT_VERSION, type CachedEnrichment } from './enrich.ts';
import { makeCandidate } from './dedupe.ts';
import { makePost } from './test-helpers.ts';
import type { Candidate } from './types.ts';

const enrichment: Enrichment = {
  roleCategory: 'Software Engineering',
  cities: ['Pune'],
  workMode: 'onsite',
  jobType: 'internship',
  isFresher: true,
  experienceMinYears: 0,
  experienceMaxYears: 1,
  stipendMinMonthlyInr: null,
  stipendMaxMonthlyInr: null,
  skills: ['python'],
  confidence: 0.9,
};
const result = (over: Partial<EnrichResult> = {}): EnrichResult => ({
  enrichment,
  provenance: { roleCategory: 'jev' },
  needsReview: false,
  promptVersion: 'v1',
  used: { jev: true, llm: false },
  ...over,
});
const cand = (id: string, over = {}) => makeCandidate(makePost({ sourceJobId: id, ...over }), 'unknown', () => []);

describe('enrichStage', () => {
  it('calls enrich for each candidate and passes the run id', async () => {
    const enrich = vi.fn(async (_p: JobPost, _o?: EnrichOptions) => result());
    const jobIds = new Map<Candidate, number>();
    const [a, b] = [cand('1'), cand('2')];
    jobIds.set(b, 99);
    const out = await enrichStage([a, b], { runId: 42, enrich, jobIds });
    expect(enrich).toHaveBeenCalledTimes(2);
    expect(enrich.mock.calls[0]![1]).toEqual({ runId: 42, jobId: undefined });
    expect(enrich.mock.calls[1]![1]).toEqual({ runId: 42, jobId: 99 });
    expect(out.items.map((i) => i.enrichment.roleCategory)).toEqual(['Software Engineering', 'Software Engineering']);
    expect(out.cacheHits).toBe(0);
  });

  it('reuses the tag cache by content hash and skips enrich for hits', async () => {
    const a = cand('1');
    const b = cand('2', { title: 'Another Role' });
    const cached: CachedEnrichment = { enrichment, provenance: { roleCategory: 'llm' }, promptVersion: 'v0' };
    const enrich = vi.fn(async () => result());
    const out = await enrichStage([a, b], { runId: 1, enrich, cache: new Map([[a.contentHash, cached]]) });
    expect(enrich).toHaveBeenCalledTimes(1);
    expect(out.cacheHits).toBe(1);
    expect(out.items[0]).toMatchObject({ fromCache: true, promptVersion: 'v0', needsReview: false });
    expect(out.items[1]!.fromCache).toBe(false);
  });

  it('falls back to rule-only values with needsReview when enrich throws', async () => {
    const seen: string[] = [];
    const enrich = vi.fn(async () => {
      throw new Error('provider down');
    });
    const out = await enrichStage([cand('1')], { runId: 1, enrich, onError: (_c, m) => seen.push(m) });
    expect(out.failures).toBe(1);
    expect(seen).toEqual(['provider down']);
    expect(out.items[0]).toMatchObject({ needsReview: true, promptVersion: FALLBACK_PROMPT_VERSION, used: { jev: false, llm: false } });
    expect(out.items[0]!.enrichment.roleCategory).toBeTruthy();
  });

  it('treats an invalid enrichment object as a failure, not a crash', async () => {
    const enrich = vi.fn(async () => result({ enrichment: { ...enrichment, roleCategory: 'Nonsense' as never } }));
    const out = await enrichStage([cand('1')], { runId: 1, enrich });
    expect(out.failures).toBe(1);
    expect(out.items[0]!.needsReview).toBe(true);
  });

  it('respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const enrich = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return result();
    };
    await enrichStage(Array.from({ length: 20 }, (_, i) => cand(String(i))), { runId: 1, enrich, concurrency: 6 });
    expect(peak).toBe(6);
  });
});

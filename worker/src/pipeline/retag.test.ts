import { JEV_PROMPT_VERSION, LLM_PROMPT_VERSION } from '@beep/ai';
import { describe, expect, it } from 'vitest';
import { addToSummary, emptyRetagSummary, isCurrentVersion, isStale, selectRetag, type RetagCandidate } from './retag.ts';

const job = (id: number, promptVersion: string | null, needsReview = false, isFresher = true): RetagCandidate => ({
  id,
  promptVersion,
  needsReview,
  isFresher,
});

describe('isCurrentVersion', () => {
  it('accepts what the graph writes today', () => {
    for (const v of ['rules', JEV_PROMPT_VERSION, LLM_PROMPT_VERSION, `${JEV_PROMPT_VERSION}+${LLM_PROMPT_VERSION}`]) {
      expect(isCurrentVersion(v)).toBe(true);
    }
  });
  it('rejects stub-era, fallback, unknown and missing versions', () => {
    for (const v of ['stub', 'rules-fallback', 'error', 'jev.v0', `${JEV_PROMPT_VERSION}+llm.v0`, '', null]) {
      expect(isCurrentVersion(v)).toBe(false);
    }
  });
});

describe('isStale', () => {
  it('flags an old prompt version regardless of providers', () => {
    expect(isStale(job(1, 'stub'), false)).toBe(true);
    expect(isStale(job(1, null), false)).toBe(true);
  });
  it('leaves current jobs alone when no provider is configured', () => {
    expect(isStale(job(1, 'rules', true), false)).toBe(false);
  });
  it('flags flagged jobs no provider has tagged once providers are configured', () => {
    expect(isStale(job(1, 'rules', true), true)).toBe(true);
    expect(isStale(job(1, 'rules', false), true)).toBe(false);
  });
  it('does not re-pick a flagged job that already had an AI pass (so runs converge)', () => {
    expect(isStale(job(1, JEV_PROMPT_VERSION, true), true)).toBe(false);
    expect(isStale(job(1, `${JEV_PROMPT_VERSION}+${LLM_PROMPT_VERSION}`, true), true)).toBe(false);
  });
});

describe('selectRetag', () => {
  const jobs = [job(5, 'stub'), job(2, 'rules', true), job(9, JEV_PROMPT_VERSION), job(1, 'rules'), job(3, 'error', true)];

  it('stale mode: oldest first, honouring the provider state', () => {
    expect(selectRetag(jobs, { mode: 'stale', aiConfigured: false })).toEqual([3, 5]);
    expect(selectRetag(jobs, { mode: 'stale', aiConfigured: true })).toEqual([2, 3, 5]);
  });
  it('needs-review mode picks every flagged job', () => {
    expect(selectRetag(jobs, { mode: 'needs-review', aiConfigured: false })).toEqual([2, 3]);
  });
  it('all mode picks everything', () => {
    expect(selectRetag(jobs, { mode: 'all', aiConfigured: false })).toEqual([1, 2, 3, 5, 9]);
  });
  it('caps the batch and keeps the oldest', () => {
    expect(selectRetag(jobs, { mode: 'all', aiConfigured: false, limit: 2 })).toEqual([1, 2]);
  });
});

describe('addToSummary', () => {
  it('counts flips in both directions and still-flagged jobs', () => {
    const s = emptyRetagSummary();
    addToSummary(s, { isFresher: true }, { isFresher: false, needsReview: true });
    addToSummary(s, { isFresher: false }, { isFresher: true, needsReview: false });
    addToSummary(s, { isFresher: true }, { isFresher: true, needsReview: false });
    expect(s).toEqual({ retagged: 3, flippedToNotFresher: 1, flippedToFresher: 1, stillNeedsReview: 1 });
  });
});

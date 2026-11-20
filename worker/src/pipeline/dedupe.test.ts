import { urlHash } from '@beep/shared';
import { describe, expect, it } from 'vitest';
import {
  collapseExact,
  collapseFuzzy,
  dedupeStage,
  isFuzzyDuplicate,
  makeCandidate,
  type DedupeRepo,
  type ExistingJob,
  type PoolJob,
} from './dedupe.ts';
import { makePost } from './test-helpers.ts';
import type { Candidate } from './types.ts';
import { sourceKey } from './util.ts';

const cand = (over: Parameters<typeof makePost>[0] = {}, cities: string[] = ['Pune']): Candidate =>
  makeCandidate(makePost(over), 'yes', () => cities);

class FakeRepo implements DedupeRepo {
  bySource = new Map<string, ExistingJob>();
  byHash = new Map<string, ExistingJob>();
  pool = new Map<string, PoolJob[]>();
  async findBySourceKeys() {
    return this.bySource;
  }
  async findByUrlHashes() {
    return this.byHash;
  }
  async loadFuzzyPool() {
    return this.pool;
  }
}

describe('collapseExact', () => {
  it('merges identical apply URLs from different sources and keeps both links', () => {
    const a = cand({ source: 'a', sourceJobId: '1', applyUrl: 'https://x.test/j/1?utm_source=feed', description: 'short' });
    const b = cand({ source: 'b', sourceJobId: '9', applyUrl: 'https://x.test/j/1', description: 'a much longer description' });
    const { unique, merged } = collapseExact([a, b]);
    expect(merged).toBe(1);
    expect(unique).toHaveLength(1);
    expect(unique[0]!.links.map((l) => l.source)).toEqual(['a', 'b']);
    expect(unique[0]!.post.description).toBe('a much longer description');
  });

  it('merges the same (source, sourceJobId) even with different URLs', () => {
    const { unique, merged } = collapseExact([cand({ applyUrl: 'https://x.test/a' }), cand({ applyUrl: 'https://x.test/b' })]);
    expect(merged).toBe(1);
    expect(unique[0]!.links).toHaveLength(1);
  });

  it('keeps distinct posts', () => {
    expect(collapseExact([cand({ sourceJobId: '1' }), cand({ sourceJobId: '2' })]).merged).toBe(0);
  });
});

describe('fuzzy matching', () => {
  const base = { companyNorm: 'acme', titleNorm: 'software engineer intern', locationRaw: 'Pune', cities: ['Pune'] };

  it('matches same company, overlapping city and similar title', () => {
    expect(isFuzzyDuplicate(base, { ...base, titleNorm: 'software engineer interns' })).toBe(true);
  });
  it('matches on identical location text when no city is known', () => {
    expect(isFuzzyDuplicate({ ...base, cities: [] }, { ...base, cities: [], locationRaw: ' pune ' })).toBe(true);
  });
  it('does not match different cities, companies or dissimilar titles', () => {
    expect(isFuzzyDuplicate(base, { ...base, cities: ['Mumbai'], locationRaw: 'Mumbai' })).toBe(false);
    expect(isFuzzyDuplicate(base, { ...base, companyNorm: 'other' })).toBe(false);
    expect(isFuzzyDuplicate(base, { ...base, titleNorm: 'marketing manager' })).toBe(false);
  });
  it('never matches empty location on both sides', () => {
    expect(isFuzzyDuplicate({ ...base, cities: [], locationRaw: '' }, { ...base, cities: [], locationRaw: '' })).toBe(false);
  });

  it('collapses a cross-source repeat inside a batch and keeps the richer description', () => {
    const a = cand({ source: 'a', sourceJobId: '1', title: 'Software Engineer Intern', description: 'x' });
    const b = cand({ source: 'b', sourceJobId: '2', title: 'Software Engineer - Intern', applyUrl: 'https://other.test/2', description: 'xxxxxx' });
    const c = cand({ source: 'a', sourceJobId: '3', title: 'Accountant', applyUrl: 'https://other.test/3' });
    const { unique, merged } = collapseFuzzy([a, b, c]);
    expect(merged).toBe(1);
    expect(unique).toHaveLength(2);
    expect(unique[0]!.links).toHaveLength(2);
    expect(unique[0]!.post.description).toBe('xxxxxx');
  });
});

describe('dedupeStage', () => {
  it('passes new posts through and counts nothing', async () => {
    const res = await dedupeStage([cand({ sourceJobId: '1' }), cand({ sourceJobId: '2', title: 'Accountant Trainee' })], new FakeRepo());
    expect(res).toMatchObject({ duplicatesExact: 0, duplicatesFuzzy: 0, touches: [] });
    expect(res.fresh).toHaveLength(2);
  });

  it('treats a known (source, sourceJobId) as seen again, not as a duplicate', async () => {
    const c = cand({ sourceJobId: '1' });
    const repo = new FakeRepo();
    repo.bySource.set(sourceKey('fake', '1'), { id: 7, primarySource: 'fake', contentHash: c.contentHash });
    const res = await dedupeStage([c], repo);
    expect(res.fresh).toHaveLength(0);
    expect(res.duplicatesExact).toBe(0);
    expect(res.touches).toMatchObject([{ jobId: 7 }]);
    expect(res.touches[0]!.refresh).toBeUndefined();
  });

  it('flags a refresh when the primary source changed its content', async () => {
    const c = cand({ sourceJobId: '1', description: 'new text' });
    const repo = new FakeRepo();
    repo.bySource.set(sourceKey('fake', '1'), { id: 7, primarySource: 'fake', contentHash: 'old-hash', isPrimaryLink: true });
    const res = await dedupeStage([c], repo);
    expect(res.touches[0]!.refresh).toBe(c);
  });

  it('does not refresh when a secondary listing differs (only the primary listing owns the content), even from the same source', async () => {
    const c = cand({ source: 'b', sourceJobId: '1', description: 'other text' });
    const repo = new FakeRepo();
    repo.bySource.set(sourceKey('b', '1'), { id: 7, primarySource: 'a', contentHash: 'old-hash', isPrimaryLink: false });
    const res = await dedupeStage([c], repo);
    expect(res.touches[0]!.refresh).toBeUndefined();
  });

  it('merges a post whose URL is already known from another source as an exact duplicate', async () => {
    const c = cand({ source: 'b', sourceJobId: '5', applyUrl: 'https://x.test/j/1' });
    const repo = new FakeRepo();
    repo.byHash.set(urlHash('https://x.test/j/1'), { id: 3, primarySource: 'a', contentHash: null });
    const res = await dedupeStage([c], repo);
    expect(res.duplicatesExact).toBe(1);
    expect(res.fresh).toHaveLength(0);
    expect(res.touches[0]).toMatchObject({ jobId: 3, links: [{ source: 'b', sourceJobId: '5' }] });
  });

  it('merges fuzzy matches into an active job, offering a longer description', async () => {
    const c = cand({ source: 'b', sourceJobId: '5', title: 'Software Engineer - Intern', applyUrl: 'https://y.test/5', description: 'a long description' });
    const repo = new FakeRepo();
    repo.pool.set(c.companyNorm, [
      { id: 11, companyNorm: c.companyNorm, titleNorm: 'software engineer intern', locationRaw: 'Pune', cities: ['Pune'], descriptionLength: 3 },
    ]);
    const res = await dedupeStage([c], repo);
    expect(res.duplicatesFuzzy).toBe(1);
    expect(res.fresh).toHaveLength(0);
    expect(res.touches[0]).toMatchObject({ jobId: 11, description: 'a long description' });
  });

  it('does not offer a shorter description', async () => {
    const c = cand({ source: 'b', sourceJobId: '5', applyUrl: 'https://y.test/5', description: 'short' });
    const repo = new FakeRepo();
    repo.pool.set(c.companyNorm, [
      { id: 11, companyNorm: c.companyNorm, titleNorm: c.titleNorm, locationRaw: 'Pune', cities: ['Pune'], descriptionLength: 500 },
    ]);
    const res = await dedupeStage([c], repo);
    expect(res.touches[0]!.description).toBeUndefined();
  });

  it('counts in-batch exact and fuzzy duplicates', async () => {
    const posts = [
      cand({ source: 'a', sourceJobId: '1', applyUrl: 'https://x.test/1' }),
      cand({ source: 'b', sourceJobId: '2', applyUrl: 'https://x.test/1' }),
      cand({ source: 'c', sourceJobId: '3', applyUrl: 'https://z.test/3', title: 'Software Engineer - Intern' }),
      cand({ source: 'a', sourceJobId: '4', applyUrl: 'https://x.test/4', title: 'Chartered Accountant' }),
    ];
    const res = await dedupeStage(posts, new FakeRepo());
    expect(res.duplicatesExact).toBe(1);
    expect(res.duplicatesFuzzy).toBe(1);
    expect(res.fresh).toHaveLength(2);
  });
});

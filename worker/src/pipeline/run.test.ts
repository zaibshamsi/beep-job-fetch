import { describe, expect, it } from 'vitest';
import { sourcesFetchedOk } from './lifecycle.ts';
import { toRawRows } from './raw.ts';
import { runStatus } from './run.ts';

const s = (over: object = {}) => ({ fetched: 5, normalized: 5, rejected: 0, ms: 1, ...over });

describe('runStatus', () => {
  it('is success with no sources, or when nothing errored', () => {
    expect(runStatus({})).toBe('success');
    expect(runStatus({ a: s(), b: s({ skipped: 'no key' }) })).toBe('success');
  });
  it('is partial when some sources errored', () => {
    expect(runStatus({ a: s(), b: s({ error: 'boom' }) })).toBe('partial');
  });
  it('is failed when every attempted source errored', () => {
    expect(runStatus({ a: s({ error: 'x' }), b: s({ error: 'y' }), c: s({ skipped: 'z' }) })).toBe('failed');
  });
});

describe('sourcesFetchedOk', () => {
  it('excludes errored, skipped and empty sources', () => {
    const ok = sourcesFetchedOk({
      good: s(),
      broke: s({ error: 'x' }),
      skipped: s({ skipped: 'no key' }),
      empty: s({ fetched: 0 }),
    });
    expect(ok).toEqual(['good']);
  });
});

describe('sourcesFetchedOk (rate-limited adapters)', () => {
  it('treats a successful fetch of 0 posts (e.g. remotive inside its minimum interval) as not fetched', () => {
    expect(sourcesFetchedOk({ remotive: s({ fetched: 0 }), other: s() })).toEqual(['other']);
    expect(sourcesFetchedOk({ remotive: s({ fetched: 0 }) })).toEqual([]);
  });
});

describe('toRawRows', () => {
  it('serialises the payload and hashes it', () => {
    const rows = toRawRows(9, 'fake', [
      { source: 'fake', sourceJobId: '1', payload: { a: 1 } },
      { source: 'fake', sourceJobId: '2', payload: { a: 1 } },
      { source: 'fake', sourceJobId: '3', payload: { a: 2 } },
    ]);
    expect(rows[0]).toMatchObject({ runId: 9, source: 'fake', sourceJobId: '1', payload: '{"a":1}' });
    expect(rows[0]!.contentHash).toHaveLength(64);
    expect(rows[0]!.contentHash).toBe(rows[1]!.contentHash);
    expect(rows[0]!.contentHash).not.toBe(rows[2]!.contentHash);
  });
});

import { describe, expect, it } from 'vitest';
import type { JobListItem } from '../../api/types.ts';
import { mergeLists } from './merge.ts';

const job = (id: number, postedAt: string): JobListItem =>
  ({ id, postedAt, firstSeenAt: postedAt, title: `Job ${id}` }) as unknown as JobListItem;

const a = [job(1, '2026-11-18T10:00:00Z'), job(2, '2026-11-10T10:00:00Z')];
const b = [job(3, '2026-11-17T10:00:00Z'), job(4, '2026-11-01T10:00:00Z')];

describe('mergeLists', () => {
  it('returns a single list unchanged', () => {
    expect(mergeLists([a], 'newest').map((j) => j.id)).toEqual([1, 2]);
    expect(mergeLists([[], a], 'relevance').map((j) => j.id)).toEqual([1, 2]);
    expect(mergeLists([], 'newest')).toEqual([]);
  });

  it('merges by date, newest first', () => {
    expect(mergeLists([a, b], 'newest').map((j) => j.id)).toEqual([1, 3, 2, 4]);
  });

  it('interleaves by rank for relevance', () => {
    expect(mergeLists([b, a], 'relevance').map((j) => j.id)).toEqual([3, 1, 4, 2]);
  });

  it('drops duplicates', () => {
    expect(mergeLists([a, [a[0]!]], 'newest').map((j) => j.id)).toEqual([1, 2]);
  });
});

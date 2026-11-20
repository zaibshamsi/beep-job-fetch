import { describe, expect, it } from 'vitest';
import { fresherFilter } from './fresher.ts';
import { makePost } from './test-helpers.ts';

describe('fresherFilter', () => {
  it("drops 'no', keeps 'yes' and 'unknown', and treats a throwing check as unknown", () => {
    const posts = ['yes', 'no', 'unknown', 'throw'].map((t) => makePost({ sourceJobId: t, title: t }));
    const res = fresherFilter(posts, (p) => {
      if (p.title === 'throw') throw new Error('rules broke');
      return { verdict: p.title as 'yes' | 'no' | 'unknown', reason: '' };
    });
    expect(res.dropped).toBe(1);
    expect(res.kept.map((k) => [k.post.title, k.verdict])).toEqual([
      ['yes', 'yes'],
      ['unknown', 'unknown'],
      ['throw', 'unknown'],
    ]);
  });
});

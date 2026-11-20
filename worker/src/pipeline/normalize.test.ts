import type { JobPost } from '@beep/shared';
import { describe, expect, it } from 'vitest';
import { MAX_DESCRIPTION_CHARS, normalizeRaw } from './normalize.ts';
import { fakeAdapter, makePost, rawOf } from './test-helpers.ts';

describe('normalizeRaw', () => {
  it('accepts valid posts, collapsing whitespace and forcing the adapter name as source', () => {
    const adapter = fakeAdapter({ name: 'fake' });
    const raw = rawOf({ sourceJobId: '1', title: '  Data   Analyst\n Intern ', source: 'other' as never });
    const res = normalizeRaw(adapter, [raw]);
    expect(res.rejected).toBe(0);
    expect(res.posts[0]).toMatchObject({ title: 'Data Analyst Intern', source: 'fake' });
  });

  it('counts null, invalid and throwing normalizations as rejected with reasons', () => {
    const adapter = fakeAdapter({
      normalize: (raw) => {
        const id = raw.sourceJobId;
        if (id === 'null') return null;
        if (id === 'throw') throw new Error('bad payload');
        if (id === 'badurl') return makePost({ sourceJobId: id, applyUrl: 'not a url' });
        return makePost({ sourceJobId: id });
      },
    });
    const raws = ['ok', 'null', 'throw', 'badurl'].map((id) => rawOf({ sourceJobId: id }));
    const res = normalizeRaw(adapter, raws);
    expect(res.posts).toHaveLength(1);
    expect(res.rejected).toBe(3);
    expect(res.reasons.join('\n')).toMatch(/filtered out/);
    expect(res.reasons.join('\n')).toMatch(/bad payload/);
    expect(res.reasons.join('\n')).toMatch(/applyUrl/);
  });

  it('caps the number of recorded reasons but not the rejected count', () => {
    const adapter = fakeAdapter({ normalize: () => null });
    const raws = Array.from({ length: 12 }, (_, i) => rawOf({ sourceJobId: String(i) }));
    const res = normalizeRaw(adapter, raws, 3);
    expect(res.rejected).toBe(12);
    expect(res.reasons).toHaveLength(3);
  });

  it('truncates huge descriptions', () => {
    const adapter = fakeAdapter({ normalize: () => makePost({ description: 'x'.repeat(50_000) }) as JobPost });
    const res = normalizeRaw(adapter, [rawOf({ sourceJobId: '1' })]);
    expect(res.posts[0]!.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
  });
});

import { createLogger } from '@beep/shared';
import { describe, expect, it } from 'vitest';
import { fetchStage, skipReason } from './fetch.ts';
import { fakeAdapter, rawOf } from './test-helpers.ts';

const log = createLogger('test');
const opts = (over = {}) => ({ runId: 1, log, maxPostsPerSource: 1500, enabled: new Map<string, boolean>(), ...over });

describe('skipReason', () => {
  it('lets an allowed, available, enabled source run', () => {
    expect(skipReason(fakeAdapter(), new Map())).toBeNull();
    expect(skipReason(fakeAdapter({ meta: { termsStatus: 'allowed_with_limits' } }), new Map())).toBeNull();
  });
  it('refuses forbidden and unclear terms', () => {
    expect(skipReason(fakeAdapter({ meta: { termsStatus: 'forbidden' } }), new Map())).toMatch(/forbidden/);
    expect(skipReason(fakeAdapter({ meta: { termsStatus: 'unclear' } }), new Map())).toMatch(/unclear/);
  });
  it('refuses sources disabled in the sources table', () => {
    expect(skipReason(fakeAdapter({ name: 'x' }), new Map([['x', false]]))).toMatch(/disabled/);
  });
  it('returns the adapter reason when it is unavailable', () => {
    expect(skipReason(fakeAdapter({ unavailable: 'missing API key' }), new Map())).toBe('missing API key');
  });
});

describe('fetchStage', () => {
  it('isolates a failing source and still returns the others, in adapter order', async () => {
    const good = fakeAdapter({ name: 'good', raws: [rawOf({ sourceJobId: 'a' }, 'good')] });
    const bad = fakeAdapter({
      name: 'bad',
      raws: async () => {
        throw new Error('boom');
      },
    });
    const out = await fetchStage([bad, good], opts());
    expect(out.map((o) => o.adapter.name)).toEqual(['bad', 'good']);
    expect(out[0]).toMatchObject({ error: 'boom', posts: [] });
    expect(out[1]!.posts).toHaveLength(1);
    expect(out[1]!.error).toBeUndefined();
  });

  it('does not call fetch for skipped sources', async () => {
    let called = false;
    const a = fakeAdapter({
      name: 'forbidden',
      meta: { termsStatus: 'forbidden' },
      raws: async () => {
        called = true;
        return [];
      },
    });
    const out = await fetchStage([a], opts());
    expect(called).toBe(false);
    expect(out[0]!.skipped).toMatch(/forbidden/);
  });

  it('caps posts per source', async () => {
    const raws = Array.from({ length: 10 }, (_, i) => rawOf({ sourceJobId: String(i) }));
    const out = await fetchStage([fakeAdapter({ raws })], opts({ maxPostsPerSource: 3 }));
    expect(out[0]!.posts).toHaveLength(3);
  });

  it('runs at most `concurrency` adapters at once', async () => {
    let active = 0;
    let peak = 0;
    const slow = (name: string) =>
      fakeAdapter({
        name,
        raws: async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 15));
          active--;
          return [];
        },
      });
    await fetchStage(Array.from({ length: 9 }, (_, i) => slow(`s${i}`)), opts({ concurrency: 4 }));
    expect(peak).toBe(4);
  });

  it('times out a hung adapter and reports it as an error', async () => {
    const hung = fakeAdapter({ name: 'hung', raws: () => new Promise(() => undefined) });
    const out = await fetchStage([hung], opts({ timeoutMs: 20 }));
    expect(out[0]!.error).toMatch(/timed out/);
  });
});

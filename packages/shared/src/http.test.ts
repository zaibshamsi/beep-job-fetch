import { afterEach, describe, expect, it, vi } from 'vitest';
import { politeFetch } from './http.ts';

afterEach(() => vi.restoreAllMocks());

describe('politeFetch throttle', () => {
  it('spaces requests to the same host', async () => {
    const stub = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('ok'));
    const t0 = Date.now();
    await Promise.all([1, 2, 3].map(() => politeFetch('https://throttle-a.test/x', { respectRobots: false, minDelayMs: 150 })));
    expect(stub).toHaveBeenCalledTimes(3);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(280);
  });

  it('an aborted caller does not hold up the queue behind it', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('ok'));
    const ctrl = new AbortController();
    // 20 queued requests at 300 ms each would take 6 s if every aborted one still slept its turn
    const queued = Array.from({ length: 20 }, () =>
      politeFetch('https://throttle-b.test/x', { respectRobots: false, minDelayMs: 300, signal: ctrl.signal }).then(
        () => 'ok',
        () => 'aborted',
      ),
    );
    setTimeout(() => ctrl.abort(), 100);
    const t0 = Date.now();
    const results = await Promise.all(queued);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(results.filter((r) => r === 'aborted').length).toBeGreaterThan(15);
  });
});

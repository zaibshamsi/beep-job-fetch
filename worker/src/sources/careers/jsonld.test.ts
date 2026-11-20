import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const politeFetch = vi.hoisted(() => vi.fn());
vi.mock('@beep/shared', async (importOriginal) => ({ ...(await importOriginal<typeof import('@beep/shared')>()), politeFetch }));

import { createJsonLdAdapter, type CareersSite } from './jsonld.ts';

const jobPage = readFileSync(new URL('./__fixtures__/barclays-job.html', import.meta.url), 'utf8');
const PAGES_PER_SITE = 40;
const REQUEST_MS = 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sites: CareersSite[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => ({
  slug: s,
  name: `Site ${s}`,
  sitemapUrl: `https://${s}.example.com/sitemap.xml`,
  urlPattern: '/job/',
}));

function install() {
  const requested: string[] = [];
  politeFetch.mockImplementation(async (url: string, opts: { signal?: AbortSignal } = {}) => {
    await sleep(REQUEST_MS);
    if (opts.signal?.aborted) throw new Error('aborted');
    requested.push(url);
    if (url.endsWith('/sitemap.xml')) {
      const host = new URL(url).host;
      const urls = Array.from({ length: PAGES_PER_SITE }, (_, i) => `<url><loc>https://${host}/job/bengaluru/x-${i}</loc></url>`);
      return new Response(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
    }
    return new Response(jobPage, { headers: { 'content-type': 'text/html' } });
  });
  return requested;
}

function ctx(overrides: Record<string, unknown> = {}) {
  const lines: string[] = [];
  const log = { info: (m: string) => lines.push(m), warn: () => {}, error: () => {}, debug: () => {} };
  return { lines, ctx: { runId: 1, log, maxPostsPerSource: 10_000, ...overrides } as any };
}

describe('jsonld-careers deadline and concurrency', () => {
  beforeEach(() => {
    politeFetch.mockReset();
  });

  it('crawls different sites concurrently', async () => {
    const requested = install();
    const { ctx: c } = ctx();
    let inFlight = 0;
    let peak = 0;
    const base = politeFetch.getMockImplementation()!;
    politeFetch.mockImplementation(async (...args: unknown[]) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      try {
        return await base(...args);
      } finally {
        inFlight--;
      }
    });
    const adapter = createJsonLdAdapter(sites.map((s) => ({ ...s, slug: `${s.slug}1`, sitemapUrl: s.sitemapUrl!.replace('//', '//x1.'), maxPages: 3 })), { concurrency: 3 });
    const raws = await adapter.fetch(c);
    expect(peak).toBe(3);
    expect(raws.length).toBeGreaterThan(0);
    expect(requested.length).toBeGreaterThan(0);
  });

  it('stops starting page fetches at the deadline and returns what it has', async () => {
    install();
    const { ctx: c, lines } = ctx();
    const adapter = createJsonLdAdapter(sites.map((s) => ({ ...s, slug: `${s.slug}2`, sitemapUrl: s.sitemapUrl!.replace('//', '//x2.') })), { deadlineMs: 250, concurrency: 2 });
    const t = Date.now();
    const raws = await adapter.fetch(c);
    const took = Date.now() - t;

    expect(took).toBeLessThan(250 + 400); // returned right after the deadline, not after all 6 x 40 pages (~2.4 s)
    expect(raws.length).toBeGreaterThan(0);
    expect(raws.length).toBeLessThan(sites.length * PAGES_PER_SITE);
    expect(raws.every((r) => adapter.normalize(r) !== null)).toBe(true);
    expect(lines.some((l) => /sites cut short/.test(l))).toBe(true);
  });

  it('skips sites it never got to start and says how many were cut', async () => {
    install();
    const { ctx: c, lines } = ctx();
    const adapter = createJsonLdAdapter(sites.map((s) => ({ ...s, slug: `${s.slug}3`, sitemapUrl: s.sitemapUrl!.replace('//', '//x3.') })), { deadlineMs: 150, concurrency: 1 });
    await adapter.fetch(c);
    const summary = lines.find((l) => /sites cut short/.test(l))!;
    const cutCount = Number(/; (\d+) sites cut short/.exec(summary)![1]);
    expect(cutCount).toBeGreaterThanOrEqual(5); // one site at a time: nearly all are cut or never started
  });

  it('honours ctx.signal and still returns the posts collected so far', async () => {
    install();
    const ac = new AbortController();
    const { ctx: c } = ctx({ signal: ac.signal });
    const adapter = createJsonLdAdapter(sites.map((s) => ({ ...s, slug: `${s.slug}4`, sitemapUrl: s.sitemapUrl!.replace('//', '//x4.') })), { concurrency: 2 });
    setTimeout(() => ac.abort(), 200);
    const t = Date.now();
    const raws = await adapter.fetch(c);
    expect(Date.now() - t).toBeLessThan(1500);
    expect(raws.length).toBeGreaterThan(0);
    expect(raws.length).toBeLessThan(sites.length * PAGES_PER_SITE);
  });
});

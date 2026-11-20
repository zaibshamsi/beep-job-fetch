import { readFileSync } from 'node:fs';
import pLimit from 'p-limit';
import {
  createLogger,
  politeFetch,
  RobotsDisallowedError,
  type RawPost,
  type RunContext,
  type SourceAdapter,
} from '@beep/shared';
import { decodeBody, listingLinks, newestFirst, parseFeed, parseSitemap, type UrlEntry } from './discover.ts';
import { INDIA_URL_ALTERNATION } from './filters.ts';
import { extractJobPostings, jobKey, normalizeJobPosting, type CareersPayload } from './jobposting.ts';

const log = createLogger('careers');

/** One employer career site. Exactly one of sitemapUrl / feedUrl / listUrl says where job pages are discovered. */
export interface CareersSite {
  slug: string;
  name: string;
  sitemapUrl?: string;
  /** RSS or Atom feed whose item links are job detail pages. */
  feedUrl?: string;
  /** HTML listing page; links matching urlPattern are followed (no pagination). */
  listUrl?: string;
  /** Regex source; only URLs matching it are fetched. Use it to keep to India pages and job detail pages. */
  urlPattern?: string;
  /** Regex source for child sitemaps worth opening (large sitemap indexes). */
  sitemapPattern?: string;
  /** Hard page budget for this site per run (default 300). */
  maxPages?: number;
}

export const MIN_DELAY_MS = 1500;
const DEFAULT_MAX_PAGES = 300;
const MAX_CHILD_SITEMAPS = 25;
const SITE_CONCURRENCY = 6; // different hosts only; each host is serialised and throttled by politeFetch
/** The pipeline aborts a source after 10 minutes and then keeps nothing, so stop starting work after 8. */
export const DEFAULT_DEADLINE_MS = 8 * 60_000;
/** In-flight requests may finish (or be aborted) this long after the deadline before fetch() returns. */
const DEADLINE_GRACE_MS = 45_000;

export interface JsonLdOptions {
  /** Wall time after which no new page fetch is started. Default 8 minutes. */
  deadlineMs?: number;
  /** Sites crawled at once (each is a different host). Default 6. */
  concurrency?: number;
}

interface CacheEntry {
  etag: string | null;
  lastModified: string | null;
  lastmod: string | null;
  payload: CareersPayload | null;
}
/** Survives between runs of the long-lived worker so unchanged pages cost a 304 or nothing at all. */
const pageCache = new Map<string, CacheEntry>();

const SOURCE = 'jsonld-careers';
const toRaw = (payload: CareersPayload): RawPost => ({
  source: SOURCE,
  sourceJobId: jobKey(payload),
  payload,
});

export function loadSites(): CareersSite[] {
  return JSON.parse(readFileSync(new URL('./sites.json', import.meta.url), 'utf8')) as CareersSite[];
}

const opts = (ctx: RunContext, extra: Record<string, string> = {}) => ({
  minDelayMs: MIN_DELAY_MS,
  retries: 1,
  timeoutMs: 25_000,
  signal: ctx.signal,
  headers: extra,
});

async function getBody(url: string, ctx: RunContext): Promise<string | null> {
  const res = await politeFetch(url, { ...opts(ctx), headers: { accept: 'application/xml, text/xml, text/html;q=0.8' } });
  if (!res.ok) {
    log.warn(`${url} -> HTTP ${res.status}`);
    return null;
  }
  return decodeBody(new Uint8Array(await res.arrayBuffer()));
}

/** Discover candidate detail-page URLs for a site, newest first. */
export async function discoverUrls(site: CareersSite, ctx: RunContext, expired: () => boolean = () => false): Promise<UrlEntry[]> {
  const pattern = site.urlPattern ? new RegExp(site.urlPattern.replaceAll('{INDIA}', INDIA_URL_ALTERNATION), 'i') : null;
  const matches = (e: UrlEntry) => !pattern || pattern.test(e.loc);

  if (site.feedUrl) {
    const body = await getBody(site.feedUrl, ctx);
    return newestFirst(body ? parseFeed(body).filter(matches) : []);
  }
  if (site.listUrl) {
    const body = await getBody(site.listUrl, ctx);
    const seen = new Set<string>();
    return (body ? listingLinks(body, site.listUrl) : []).filter((e) => matches(e) && !seen.has(e.loc) && !!seen.add(e.loc));
  }
  if (!site.sitemapUrl) return [];

  const childPattern = site.sitemapPattern ? new RegExp(site.sitemapPattern, 'i') : null;
  const queue: UrlEntry[] = [{ loc: site.sitemapUrl, lastmod: null }];
  const found = new Map<string, UrlEntry>();
  let opened = 0;
  while (queue.length && opened < MAX_CHILD_SITEMAPS && !ctx.signal?.aborted && !expired()) {
    const next = queue.shift()!;
    opened++;
    let body: string | null;
    try {
      body = await getBody(next.loc, ctx);
    } catch (err) {
      if (err instanceof RobotsDisallowedError) throw err;
      log.warn(`sitemap ${next.loc} failed: ${(err as Error).message}`);
      continue;
    }
    const doc = body ? parseSitemap(body) : null;
    if (!doc) continue;
    if (doc.kind === 'index') {
      const children = newestFirst(doc.entries.filter((e) => !childPattern || childPattern.test(e.loc)));
      queue.push(...children);
    } else {
      for (const e of doc.entries) if (matches(e)) found.set(e.loc, e);
    }
  }
  return newestFirst([...found.values()]);
}

/** Fetch one detail page and read its JobPosting JSON-LD. Uses a conditional request when we have seen it before. */
async function fetchPage(site: CareersSite, entry: UrlEntry, ctx: RunContext): Promise<{ payload: CareersPayload | null; network: boolean }> {
  const cached = pageCache.get(entry.loc);
  if (cached && entry.lastmod && cached.lastmod === entry.lastmod) return { payload: cached.payload, network: false };

  const cond: Record<string, string> = {};
  if (cached?.etag) cond['if-none-match'] = cached.etag;
  if (cached?.lastModified) cond['if-modified-since'] = cached.lastModified;
  const res = await politeFetch(entry.loc, { ...opts(ctx, cond), retries: 1 });
  if (res.status === 304 && cached) {
    pageCache.set(entry.loc, { ...cached, lastmod: entry.lastmod });
    return { payload: cached.payload, network: true };
  }
  if (!res.ok) return { payload: null, network: true };

  const html = await res.text();
  // Cache only postings that pass the India/senior filters: keeps the cache small and non-India pages are not re-read.
  const payload =
    extractJobPostings(html)
      .map((jobPosting): CareersPayload => ({ site: site.name, slug: site.slug, pageUrl: res.url || entry.loc, jobPosting }))
      .find((p) => normalizeJobPosting(toRaw(p), SOURCE)) ?? null;
  pageCache.set(entry.loc, {
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
    lastmod: entry.lastmod,
    payload,
  });
  return { payload, network: true };
}

export interface SiteResult {
  raws: RawPost[];
  /** True when the deadline or an abort stopped this site before it was finished. */
  cut: boolean;
}

export async function crawlSite(site: CareersSite, ctx: RunContext, cap: number, expired: () => boolean = () => false): Promise<SiteResult> {
  const out: RawPost[] = [];
  const stop = () => !!ctx.signal?.aborted || expired();
  if (stop()) return { raws: out, cut: true };
  let entries: UrlEntry[];
  try {
    entries = await discoverUrls(site, ctx, expired);
  } catch (err) {
    log.warn(`${site.slug}: discovery skipped (${(err as Error).message})`);
    return { raws: out, cut: stop() };
  }
  let cut = false;
  const budget = site.maxPages ?? DEFAULT_MAX_PAGES;
  let network = 0;
  let indiaPages = 0;
  for (const entry of entries) {
    if (out.length >= cap || network >= budget) break;
    if (stop()) {
      cut = true;
      break;
    }
    try {
      const { payload, network: used } = await fetchPage(site, entry, ctx);
      if (used) network++;
      if (!payload) continue;
      out.push(toRaw(payload));
      indiaPages++;
    } catch (err) {
      if (err instanceof RobotsDisallowedError) {
        log.warn(`${site.slug}: robots.txt disallows ${entry.loc}; skipping`);
        continue;
      }
      log.warn(`${site.slug}: ${entry.loc} failed: ${(err as Error).message}`);
    }
  }
  log.info(`${site.slug}: ${entries.length} urls, ${network} requests, ${indiaPages} India postings${cut ? ' (cut by deadline)' : ''}`);
  return { raws: out, cut };
}

/** Round-robin across sites so a cap trims every employer evenly instead of dropping the last ones. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

export function createJsonLdAdapter(sites: CareersSite[] = loadSites(), options: JsonLdOptions = {}): SourceAdapter {
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const concurrency = options.concurrency ?? SITE_CONCURRENCY;
  return {
    name: SOURCE,
    description: 'Employer career sites: job pages found via sitemap/RSS and read from schema.org JobPosting JSON-LD',
    meta: {
      homepage: 'https://schema.org/JobPosting',
      accessMethod: 'jsonld',
      termsUrl: null,
      termsStatus: 'allowed_with_limits',
      termsNotes:
        'Checked 2026-11-18 per company (docs/CAREERS_REVIEW.md): only sites whose robots.txt allows our UA on the sitemap and job pages and whose terms do not forbid automated reading of public job listings. Pages are discovered through the site\'s own sitemap/feed and read from JobPosting JSON-LD, which sites publish for machine consumption. Limits: robots.txt honoured, >=1.5s between requests per host, <=300 pages per site per run, conditional requests, link back to the employer apply page.',
    },
    unavailableReason: () => (sites.length ? null : 'no sites configured'),
    async fetch(ctx) {
      const cap = ctx.maxPostsPerSource;
      const perSite = Math.max(25, Math.ceil(cap / 10));
      const started = Date.now();
      const expired = () => Date.now() - started >= deadlineMs;
      // Hard stop for requests still in flight shortly after the deadline, so fetch() always returns in time.
      const hardStop = AbortSignal.timeout(deadlineMs + DEADLINE_GRACE_MS);
      const crawlCtx: RunContext = { ...ctx, signal: ctx.signal ? AbortSignal.any([ctx.signal, hardStop]) : hardStop };
      const limit = pLimit(concurrency);
      // Sites are crawled in the order given (sites.json lists the highest-yield employers first).
      const results = await Promise.all(sites.map((s) => limit(() => crawlSite(s, crawlCtx, perSite, expired))));
      const all = interleave(results.map((r) => r.raws));
      const cutSites = results.filter((r) => r.cut).length;
      ctx.log.info(
        `jsonld-careers: ${all.length} India postings from ${sites.length - cutSites}/${sites.length} sites in ${Math.round((Date.now() - started) / 1000)}s` +
          (cutSites ? `; ${cutSites} sites cut short by the ${Math.round(deadlineMs / 1000)}s deadline or an abort` : ''),
      );
      return all.slice(0, cap);
    },
    normalize: (raw) => normalizeJobPosting(raw, SOURCE),
  };
}

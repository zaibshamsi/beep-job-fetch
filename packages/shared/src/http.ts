import robotsParser from 'robots-parser';
import { env } from './env.ts';
import { createLogger } from './logger.ts';
import { sleep } from './util.ts';

const log = createLogger('http');

export const USER_AGENT = `BeepJobFetchBot/0.1 (+${env.app.crawlerContact}; fresher-job-aggregator; respects robots.txt)`;

export interface PoliteFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Default true. Set false only for documented public APIs/feeds that are meant for programmatic access. */
  respectRobots?: boolean;
  /** Minimum ms between requests to the same host. Default 1000 (or the site's Crawl-delay if larger). */
  minDelayMs?: number;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
}

export class RobotsDisallowedError extends Error {
  constructor(public url: string) {
    super(`robots.txt disallows ${url}`);
  }
}

const lastHit = new Map<string, number>();
const robotsCache = new Map<string, { parser: ReturnType<typeof robotsParser> | null; fetchedAt: number }>();
const hostChains = new Map<string, Promise<void>>();

async function getRobots(origin: string) {
  const cached = robotsCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < 6 * 3600_000) return cached.parser;
  let parser: ReturnType<typeof robotsParser> | null = null;
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) parser = robotsParser(`${origin}/robots.txt`, await res.text());
    else if (res.status >= 400 && res.status < 500) parser = null; // no robots.txt = allowed
    else parser = robotsParser(`${origin}/robots.txt`, 'User-agent: *\nDisallow: /'); // server error: be conservative
  } catch {
    parser = null;
  }
  robotsCache.set(origin, { parser, fetchedAt: Date.now() });
  return parser;
}

/** Returns whether our crawler may fetch this URL, plus the site's crawl delay in ms (if declared). */
export async function checkRobots(url: string): Promise<{ allowed: boolean; crawlDelayMs: number | null }> {
  const u = new URL(url);
  const parser = await getRobots(u.origin);
  if (!parser) return { allowed: true, crawlDelayMs: null };
  const allowed = parser.isAllowed(url, USER_AGENT) !== false;
  const cd = parser.getCrawlDelay(USER_AGENT);
  return { allowed, crawlDelayMs: cd ? cd * 1000 : null };
}

/** Serialise requests per host so concurrent adapters never hammer one site. */
async function throttle(host: string, minDelayMs: number, signal?: AbortSignal) {
  const prev = hostChains.get(host) ?? Promise.resolve();
  const next = prev.then(async () => {
    // An aborted caller must not make the queue behind it wait: skip the sleep and the slot.
    if (signal?.aborted) return;
    const wait = (lastHit.get(host) ?? 0) + minDelayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());
  });
  hostChains.set(host, next.catch(() => {}));
  await next;
  signal?.throwIfAborted();
}

/**
 * Polite HTTP: honest User-Agent, robots.txt check, per-host rate limit, retry with backoff on 429/5xx
 * (honouring Retry-After), and a timeout. Returns the Response; callers read .json() / .text().
 */
export async function politeFetch(url: string, opts: PoliteFetchOptions = {}): Promise<Response> {
  const { respectRobots = true, timeoutMs = 30_000, retries = 3 } = opts;
  const host = new URL(url).host;
  let minDelay = opts.minDelayMs ?? 1000;

  if (respectRobots) {
    const r = await checkRobots(url);
    if (!r.allowed) throw new RobotsDisallowedError(url);
    if (r.crawlDelayMs && r.crawlDelayMs > minDelay) minDelay = Math.min(r.crawlDelayMs, 15_000);
  }

  let attempt = 0;
  for (;;) {
    await throttle(host, minDelay, opts.signal);
    try {
      const res = await fetch(url, {
        method: opts.method ?? 'GET',
        headers: { 'user-agent': USER_AGENT, accept: 'application/json, text/html;q=0.9, */*;q=0.5', ...opts.headers },
        body: opts.body,
        signal: opts.signal ? AbortSignal.any([opts.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const ra = Number(res.headers.get('retry-after'));
        const backoff = ra > 0 ? Math.min(ra * 1000, 60_000) : 1000 * 2 ** attempt;
        log.warn(`${res.status} from ${host}, retry ${attempt + 1}/${retries} in ${backoff}ms`);
        await sleep(backoff);
        attempt++;
        continue;
      }
      return res;
    } catch (err) {
      if (err instanceof RobotsDisallowedError) throw err;
      if (attempt < retries) {
        const backoff = 1000 * 2 ** attempt;
        log.warn(`network error from ${host} (${(err as Error).message}), retry ${attempt + 1}/${retries} in ${backoff}ms`);
        await sleep(backoff);
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

export async function fetchJson<T = unknown>(url: string, opts: PoliteFetchOptions = {}): Promise<T> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: PoliteFetchOptions = {}): Promise<string> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  return await res.text();
}

import { politeFetch, stripHtml, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, remoteIndiaLocation, toDate, toJobPost } from './common.ts';

const BASE = 'https://jobicy.com/api/v2/remote-jobs';
const PER_PAGE = 100;
const MAX_PAGES_PER_GEO = 3;
/** Jobicy has no India slug; these two cover posts open to India. */
const GEOS = ['anywhere', 'apac'];

export interface JobicyJob {
  id: number;
  url: string;
  jobTitle: string;
  companyName?: string;
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
}

export const jobicy: SourceAdapter = {
  name: 'jobicy',
  description: 'Jobicy remote jobs API (geo anywhere and apac), only posts open to India / APAC / worldwide.',
  meta: {
    homepage: 'https://jobicy.com',
    accessMethod: 'official_api',
    termsUrl: 'https://jobicy.com/jobs-rss-feed',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Verified 2026-11-18 (jobicy.com/jobs-rss-feed terms, robots.txt has Content-Signal search=yes): free use in own products allowed, including storing and caching; ' +
      'credit Jobicy as source and link to the job (keep the free-API url, which points at the Jobicy listing); never present as own postings; mark closed jobs unavailable. ' +
      'Limits: new sync pass at most once per hour, back off on HTTP 429, new listings appear after 3 h, only last 7 days returned, cursors expire after 24 h. ' +
      'We make at most 6 requests per run, 1 per 2 s.',
  },
  unavailableReason: () => null,
  async fetch(ctx) {
    const out: RawPost[] = [];
    const seen = new Set<number>();
    for (const geo of GEOS) {
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES_PER_GEO; page++) {
        if (ctx.signal?.aborted || out.length >= ctx.maxPostsPerSource) return out;
        const params = new URLSearchParams({ count: String(PER_PAGE), geo });
        if (cursor) params.set('cursor', cursor);
        try {
          const res = await politeFetch(`${BASE}?${params}`, { minDelayMs: 2000, signal: ctx.signal });
          if (res.status === 429) {
            ctx.log.warn('jobicy: HTTP 429, stopping this run');
            return out;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as { jobs?: JobicyJob[]; hasMore?: boolean; nextCursor?: string | null };
          for (const job of body.jobs ?? []) {
            if (!job.id || seen.has(job.id) || !remoteIndiaLocation(job.jobGeo)) continue;
            seen.add(job.id);
            out.push({ source: 'jobicy', sourceJobId: String(job.id), payload: job });
            if (out.length >= ctx.maxPostsPerSource) break;
          }
          cursor = body.hasMore ? (body.nextCursor ?? null) : null;
        } catch (err) {
          ctx.log.warn(`jobicy: geo=${geo} page ${page + 1} failed: ${(err as Error).message}`);
          break;
        }
        if (!cursor) break;
      }
    }
    ctx.log.info(`jobicy: ${out.length} posts open to India`);
    return out;
  },
  normalize(raw) {
    const j = raw.payload as JobicyJob;
    const location = remoteIndiaLocation(j.jobGeo);
    if (!location || !j.url || !j.jobTitle || isSeniorTitle(j.jobTitle) || /senior|lead/i.test(j.jobLevel ?? '')) return null;
    return toJobPost({
      source: 'jobicy',
      sourceJobId: String(j.id),
      title: stripHtml(j.jobTitle),
      company: j.companyName?.trim() || 'Confidential',
      locationRaw: location,
      description: stripHtml(j.jobDescription || j.jobExcerpt || ''),
      applyUrl: j.url,
      postedAt: toDate(j.pubDate),
      employmentTypeRaw: j.jobType?.join(', ') || null,
    });
  },
};

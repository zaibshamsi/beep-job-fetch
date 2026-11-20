import { env, politeFetch, stripHtml, urlHash, USER_AGENT, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, salaryText, toDate, toJobPost } from './common.ts';

const ENDPOINT = 'https://search.api.careerjet.net/v4/query';
const PAGE_SIZE = 100;
const MAX_PAGES = 3;
const MAX_REQUESTS_PER_RUN = 30;
/** contract_type 'i' = internship/training. */
const SEARCHES: { keywords: string; contract_type?: string }[] = [
  { keywords: '', contract_type: 'i' },
  { keywords: 'fresher' },
  { keywords: 'internship' },
  { keywords: 'graduate trainee' },
  { keywords: 'entry level' },
  { keywords: 'trainee' },
  { keywords: 'apprentice' },
  { keywords: 'junior' },
];
const SALARY_UNIT: Record<string, string> = { Y: 'per year', M: 'per month', W: 'per week', D: 'per day', H: 'per hour' };

export interface CareerjetJob {
  title?: string;
  company?: string;
  date?: string;
  description?: string;
  locations?: string;
  salary?: string;
  salary_currency_code?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_type?: string;
  url?: string;
  site?: string;
}

export const careerjet: SourceAdapter = {
  name: 'careerjet',
  description: 'Careerjet partner search API v4 (locale en_IN), fresher and internship searches.',
  meta: {
    homepage: 'https://www.careerjet.co.in',
    accessMethod: 'official_api',
    termsUrl: 'https://www.careerjet.com/partners/api',
    termsStatus: 'unclear',
    termsNotes:
      'Checked 2026-11-18: partner API docs (careerjet.com/partners/api) describe GET /v4/query with Basic auth (publisher key as username), ' +
      'locale_code, page_size up to 100 and page up to 10, and make user_ip and user_agent mandatory (HTTP 403 without them). ' +
      'The public docs publish no display, attribution or rate-limit terms and the API is built for live searches by a site visitor, not batch caching, ' +
      'so status stays "unclear" until the publisher agreement is read. We link to the Careerjet url returned. ' +
      'Needs CAREERJET_AFFID (publisher API key) and CAREERJET_USER_IP (the worker server public IP). Not tested live (no key).',
  },
  unavailableReason() {
    if (!env.sources.careerjetAffid) return 'CAREERJET_AFFID not set';
    if (!process.env.CAREERJET_USER_IP) return 'CAREERJET_USER_IP not set (Careerjet requires the caller IP)';
    return null;
  },
  async fetch(ctx) {
    const out: RawPost[] = [];
    const seen = new Set<string>();
    const done = new Set<number>();
    const auth = `Basic ${Buffer.from(`${env.sources.careerjetAffid}:`).toString('base64')}`;
    let requests = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      for (const [i, search] of SEARCHES.entries()) {
        if (ctx.signal?.aborted || out.length >= ctx.maxPostsPerSource || requests >= MAX_REQUESTS_PER_RUN) return out;
        if (done.has(i)) continue;
        const params = new URLSearchParams({
          locale_code: 'en_IN',
          location: 'India',
          sort: 'date',
          page: String(page),
          page_size: String(PAGE_SIZE),
          user_ip: process.env.CAREERJET_USER_IP ?? '',
          user_agent: USER_AGENT,
        });
        if (search.keywords) params.set('keywords', search.keywords);
        if (search.contract_type) params.set('contract_type', search.contract_type);
        requests++;
        try {
          const res = await politeFetch(`${ENDPOINT}?${params}`, {
            headers: { authorization: auth },
            respectRobots: false, // documented API endpoint
            minDelayMs: 2000,
            signal: ctx.signal,
          });
          if (res.status === 401 || res.status === 403) throw new Error(`Careerjet rejected the request (HTTP ${res.status})`);
          if (!res.ok) {
            ctx.log.warn(`careerjet: HTTP ${res.status} for search ${i} page ${page}`);
            done.add(i);
            continue;
          }
          const body = (await res.json()) as { jobs?: CareerjetJob[]; pages?: number };
          const jobs = body.jobs ?? [];
          if (jobs.length < PAGE_SIZE || (body.pages && page >= body.pages)) done.add(i);
          for (const job of jobs) {
            if (!job.url || seen.has(job.url)) continue;
            seen.add(job.url);
            out.push({ source: 'careerjet', sourceJobId: urlHash(job.url).slice(0, 32), payload: job });
            if (out.length >= ctx.maxPostsPerSource) break;
          }
        } catch (err) {
          if (/rejected the request/.test((err as Error).message)) throw err;
          if (ctx.signal?.aborted) return out;
          ctx.log.warn(`careerjet: search ${i} page ${page} failed: ${(err as Error).message}`);
          done.add(i);
        }
      }
    }
    ctx.log.info(`careerjet: ${out.length} unique posts from ${requests} requests`);
    return out;
  },
  normalize(raw) {
    const j = raw.payload as CareerjetJob;
    if (!j.title || !j.url || isSeniorTitle(j.title)) return null;
    const unit = `${j.salary_currency_code ?? 'INR'} ${SALARY_UNIT[j.salary_type ?? ''] ?? ''}`.trim();
    return toJobPost({
      source: 'careerjet',
      sourceJobId: raw.sourceJobId,
      title: stripHtml(j.title),
      company: j.company?.trim() || 'Confidential',
      locationRaw: j.locations?.trim() || 'India',
      description: stripHtml(j.description ?? ''),
      applyUrl: j.url,
      postedAt: toDate(j.date),
      compensationRaw: salaryText(j.salary_min, j.salary_max, unit) ?? (j.salary?.trim() || null),
    });
  },
};

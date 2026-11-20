import { env, politeFetch, stripHtml, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, salaryText, toDate, toJobPost } from './common.ts';

const BASE = 'https://api.adzuna.com/v1/api/jobs/in/search';
const PER_PAGE = 50; // documented maximum for results_per_page
const MAX_PAGES = 5;
/** Adzuna plans are metered per minute/day/week (see the account page), so one run stays well under them. */
const MAX_REQUESTS_PER_RUN = 80;
const MIN_DELAY_MS = 2500; // <= 24 requests a minute

const TERMS = ['intern', 'internship', 'fresher', 'graduate trainee', 'entry level', 'campus', 'trainee', 'apprentice', 'junior'];
const ROLES = ['software', 'data', 'sales', 'marketing', 'finance', 'hr', 'design', 'customer support', 'operations'];
/** Role words alone return mostly experienced jobs, so each is paired with fresher/intern wording. */
export const ADZUNA_QUERIES = [...TERMS, ...ROLES.map((r) => `${r} fresher`), ...ROLES.map((r) => `${r} intern`)];

export interface AdzunaJob {
  id: string | number;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: string | number;
  contract_type?: string;
  contract_time?: string;
  location?: { display_name?: string; area?: string[] };
  category?: { label?: string };
  company?: { display_name?: string };
}

export const adzuna: SourceAdapter = {
  name: 'adzuna',
  description: 'Adzuna India job search API (aggregates many Indian boards), fresher and internship queries, last 30 days.',
  meta: {
    homepage: 'https://www.adzuna.in',
    accessMethod: 'official_api',
    termsUrl: 'https://developer.adzuna.com/docs/terms_of_service',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Verified 2026-11-18: API terms (developer.adzuna.com/docs/terms_of_service) allow displaying ads from the API. Rules we follow: ' +
      'label every displayed ad "Adzuna" (logo at least 116x23 px, hyperlinked to adzuna.in) and acknowledge Adzuna as source of vacancy data; ' +
      'salary estimates (salary_is_predicted=1) need the Adzuna Jobsworth icon and "Salary estimate powered by Adzuna Jobsworth"; ' +
      'resale of data and lead generation need a written agreement; limits are per plan (shown in the account), we send max 24 requests/minute and ' +
      `${MAX_REQUESTS_PER_RUN} per run. We store only the snippet and link to redirect_url. The web UI must render the Adzuna attribution for source "adzuna".`,
  },
  unavailableReason() {
    return env.sources.adzunaAppId && env.sources.adzunaAppKey ? null : 'ADZUNA_APP_ID/ADZUNA_APP_KEY not set';
  },
  async fetch(ctx) {
    const out: RawPost[] = [];
    const seen = new Set<string>();
    const done = new Set<string>();
    let requests = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      for (const what of ADZUNA_QUERIES) {
        if (ctx.signal?.aborted || out.length >= ctx.maxPostsPerSource || requests >= MAX_REQUESTS_PER_RUN) return out;
        if (done.has(what)) continue;
        const params = new URLSearchParams({
          app_id: env.sources.adzunaAppId,
          app_key: env.sources.adzunaAppKey,
          results_per_page: String(PER_PAGE),
          what,
          max_days_old: '30',
          sort_by: 'date',
          'content-type': 'application/json',
        });
        requests++;
        try {
          const res = await politeFetch(`${BASE}/${page}?${params}`, {
            respectRobots: false, // documented API endpoint
            minDelayMs: MIN_DELAY_MS,
            signal: ctx.signal,
          });
          if (res.status === 401 || res.status === 403) throw new Error(`Adzuna rejected the credentials (HTTP ${res.status})`);
          if (res.status === 429) {
            ctx.log.warn('adzuna: rate limit reached, stopping this run');
            return out;
          }
          if (!res.ok) {
            ctx.log.warn(`adzuna: HTTP ${res.status} for "${what}" page ${page}`);
            done.add(what);
            continue;
          }
          const body = (await res.json()) as { results?: AdzunaJob[] };
          const results = body.results ?? [];
          if (results.length < PER_PAGE) done.add(what);
          for (const job of results) {
            const id = String(job.id ?? '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push({ source: 'adzuna', sourceJobId: id, payload: job });
            if (out.length >= ctx.maxPostsPerSource) break;
          }
        } catch (err) {
          if (/rejected the credentials/.test((err as Error).message)) throw err;
          if (ctx.signal?.aborted) return out;
          ctx.log.warn(`adzuna: "${what}" page ${page} failed: ${(err as Error).message}`);
          done.add(what);
        }
      }
    }
    ctx.log.info(`adzuna: ${out.length} unique posts from ${requests} requests`);
    return out;
  },
  normalize(raw) {
    const j = raw.payload as AdzunaJob;
    if (!j.title || !j.redirect_url || isSeniorTitle(j.title)) return null;
    const estimated = Number(j.salary_is_predicted) === 1;
    const pay = salaryText(j.salary_min, j.salary_max, 'INR per year');
    return toJobPost({
      source: 'adzuna',
      sourceJobId: String(j.id),
      title: stripHtml(j.title),
      company: j.company?.display_name?.trim() || 'Confidential',
      locationRaw: j.location?.display_name || j.location?.area?.join(', ') || 'India',
      description: stripHtml(j.description ?? ''),
      applyUrl: j.redirect_url,
      postedAt: toDate(j.created),
      employmentTypeRaw: [j.contract_time, j.contract_type].filter(Boolean).join(' ').replace(/_/g, ' ') || null,
      compensationRaw: pay ? (estimated ? `${pay} (estimated by Adzuna)` : pay) : null,
    });
  },
};

import { env, politeFetch, stripHtml, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, toDate, toJobPost } from './common.ts';

const BASE = 'https://jooble.org/api';
const PER_PAGE = 50;
const MAX_PAGES = 3;
/** Free plan: 100 requests per day per key (resets 00:00 UTC), so one run uses at most this many. */
const MAX_REQUESTS_PER_RUN = 30;
const KEYWORDS = ['fresher', 'internship', 'intern', 'graduate trainee', 'entry level', 'trainee', 'apprentice', 'junior'];

export interface JoobleJob {
  id: string | number;
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
}

export const jooble: SourceAdapter = {
  name: 'jooble',
  description: 'Jooble REST API (in.jooble.org key), India fresher and internship keyword searches.',
  meta: {
    homepage: 'https://in.jooble.org',
    accessMethod: 'official_api',
    termsUrl: 'https://jooble.org/api/about',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Checked 2026-11-18: jooble.org/api/about says portals may take Jooble search results and show them on their own site; ' +
      'docs (jooblehelpcenter.freshdesk.com, REST API documentation) give POST /api/{key}, 100 requests/day per key and country, HTTP 429 when exceeded. ' +
      'No attribution wording found in the public docs; we still link every post to its Jooble page (jobs[].link) and name Jooble as source. ' +
      'Jooble website ToS bar bots on the site itself, which does not apply to the keyed API. The key is country-specific: register on in.jooble.org. ' +
      'Not tested live (no key in this environment); verify the exact terms mailed with the key.',
  },
  unavailableReason() {
    return env.sources.joobleApiKey ? null : 'JOOBLE_API_KEY not set';
  },
  async fetch(ctx) {
    const out: RawPost[] = [];
    const seen = new Set<string>();
    const done = new Set<string>();
    let requests = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      for (const keywords of KEYWORDS) {
        if (ctx.signal?.aborted || out.length >= ctx.maxPostsPerSource || requests >= MAX_REQUESTS_PER_RUN) return out;
        if (done.has(keywords)) continue;
        requests++;
        try {
          const res = await politeFetch(`${BASE}/${env.sources.joobleApiKey}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keywords, location: 'India', page: String(page), ResultOnPage: String(PER_PAGE) }),
            respectRobots: false, // documented API endpoint
            minDelayMs: 2000,
            signal: ctx.signal,
          });
          if (res.status === 403) throw new Error('Jooble rejected the API key (HTTP 403)');
          if (res.status === 429) {
            ctx.log.warn('jooble: daily request limit reached, stopping this run');
            return out;
          }
          if (!res.ok) {
            ctx.log.warn(`jooble: HTTP ${res.status} for "${keywords}" page ${page}`);
            done.add(keywords);
            continue;
          }
          const body = (await res.json()) as { jobs?: JoobleJob[] };
          const jobs = body.jobs ?? [];
          if (jobs.length === 0) done.add(keywords);
          for (const job of jobs) {
            const id = String(job.id ?? '');
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push({ source: 'jooble', sourceJobId: id, payload: job });
            if (out.length >= ctx.maxPostsPerSource) break;
          }
        } catch (err) {
          if (/rejected the API key/.test((err as Error).message)) throw err;
          if (ctx.signal?.aborted) return out;
          ctx.log.warn(`jooble: "${keywords}" page ${page} failed: ${(err as Error).message}`);
          done.add(keywords);
        }
      }
    }
    ctx.log.info(`jooble: ${out.length} unique posts from ${requests} requests`);
    return out;
  },
  normalize(raw) {
    const j = raw.payload as JoobleJob;
    if (!j.title || !j.link || isSeniorTitle(j.title)) return null;
    return toJobPost({
      source: 'jooble',
      sourceJobId: String(j.id),
      title: stripHtml(j.title),
      company: j.company?.trim() || 'Confidential',
      locationRaw: j.location || 'India',
      description: stripHtml(j.snippet ?? ''),
      applyUrl: j.link,
      postedAt: toDate(j.updated),
      employmentTypeRaw: j.type?.trim() || null,
      compensationRaw: j.salary?.trim() || null,
    });
  },
};

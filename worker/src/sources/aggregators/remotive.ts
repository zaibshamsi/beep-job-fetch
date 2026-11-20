import { politeFetch, stripHtml, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, remoteIndiaLocation, toDate, toJobPost } from './common.ts';

const URL_ = 'https://remotive.com/api/remote-jobs';
/** Remotive asks for "a couple of times a day, max 4"; we keep at least 6 hours between calls. */
const MIN_INTERVAL_MS = 6 * 3600_000;
let lastCall = 0;

export interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

export const remotive: SourceAdapter = {
  name: 'remotive',
  description: 'Remotive public remote-jobs API, only posts open to India / APAC / worldwide candidates.',
  meta: {
    homepage: 'https://remotive.com',
    accessMethod: 'official_api',
    termsUrl: 'https://github.com/remotive-io/remote-jobs-api',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Verified 2026-11-18 (API legal notice in the response and the remotive-io/remote-jobs-api README): the API exists so developers can share jobs further, ' +
      'provided we link to the Remotive URL and name Remotive as source (apply link = Remotive job URL); max 4 calls a day (we call at most once per 6 h); ' +
      'jobs are delayed 24 h; no displaying jobs to collect sign-ups; do not forward jobs to other job aggregators. ' +
      'robots.txt disallows /api/* for crawlers, but the API is the documented programmatic channel, so we call only that one endpoint with respectRobots=false. ' +
      'Kept only when candidate_required_location mentions India, Asia, APAC, worldwide or anywhere.',
  },
  unavailableReason: () => null,
  async fetch(ctx) {
    if (Date.now() - lastCall < MIN_INTERVAL_MS) {
      ctx.log.info('remotive: called less than 6 h ago, skipping to respect the 4 calls/day guidance');
      return [];
    }
    lastCall = Date.now();
    const res = await politeFetch(URL_, { respectRobots: false, signal: ctx.signal });
    if (!res.ok) throw new Error(`remotive: HTTP ${res.status}`);
    const body = (await res.json()) as { jobs?: RemotiveJob[] };
    const out: RawPost[] = [];
    for (const job of body.jobs ?? []) {
      if (!remoteIndiaLocation(job.candidate_required_location)) continue;
      out.push({ source: 'remotive', sourceJobId: String(job.id), payload: job });
      if (out.length >= ctx.maxPostsPerSource) break;
    }
    ctx.log.info(`remotive: ${out.length} of ${body.jobs?.length ?? 0} posts are open to India`);
    return out;
  },
  normalize(raw) {
    const j = raw.payload as RemotiveJob;
    const location = remoteIndiaLocation(j.candidate_required_location);
    if (!location || !j.url || !j.title || isSeniorTitle(j.title)) return null;
    return toJobPost({
      source: 'remotive',
      sourceJobId: String(j.id),
      title: stripHtml(j.title),
      company: j.company_name?.trim() || 'Confidential',
      locationRaw: location,
      description: stripHtml(j.description ?? ''),
      applyUrl: j.url,
      postedAt: toDate(j.publication_date),
      employmentTypeRaw: j.job_type?.replace(/_/g, ' ') || null,
      compensationRaw: j.salary?.trim() || null,
    });
  },
};

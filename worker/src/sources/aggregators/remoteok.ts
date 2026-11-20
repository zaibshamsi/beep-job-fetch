import { politeFetch, stripHtml, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, remoteIndiaLocation, salaryText, toDate, toJobPost } from './common.ts';

const URL_ = 'https://remoteok.com/api';

export interface RemoteOkJob {
  id?: string;
  url?: string;
  date?: string;
  company?: string;
  position?: string;
  location?: string;
  description?: string;
  salary_min?: number;
  salary_max?: number;
}

export const remoteok: SourceAdapter = {
  name: 'remoteok',
  description: 'Remote OK public JSON API, only posts whose location is India / Asia / worldwide.',
  meta: {
    homepage: 'https://remoteok.com',
    accessMethod: 'official_api',
    termsUrl: 'https://remoteok.com/api',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Verified 2026-11-18: the first element of https://remoteok.com/api carries the API terms: link back to the Remote OK URL of each job with a followed link ' +
      'and mention Remote OK as the source or API access is suspended; no Remote OK logo without written permission. robots.txt allows crawling for search (Content-Signal search=yes). ' +
      'No rate limit is published; we make one request per run. Applies the India filter on the free-text location (India, Asia, APAC, worldwide, anywhere); ' +
      'empty locations are dropped. apply link = the Remote OK job url.',
  },
  unavailableReason: () => null,
  async fetch(ctx) {
    const res = await politeFetch(URL_, { signal: ctx.signal });
    if (!res.ok) throw new Error(`remoteok: HTTP ${res.status}`);
    const body = (await res.json()) as RemoteOkJob[];
    const out: RawPost[] = [];
    for (const job of body.slice(1)) {
      // body[0] is the legal notice object, real jobs have an id and a position
      if (!job.id || !job.position || !remoteIndiaLocation(job.location)) continue;
      out.push({ source: 'remoteok', sourceJobId: String(job.id), payload: job });
      if (out.length >= ctx.maxPostsPerSource) break;
    }
    ctx.log.info(`remoteok: ${out.length} of ${body.length - 1} posts are open to India`);
    return out;
  },
  normalize(raw) {
    const j = raw.payload as RemoteOkJob;
    const location = remoteIndiaLocation(j.location);
    if (!location || !j.url || !j.position || isSeniorTitle(j.position)) return null;
    return toJobPost({
      source: 'remoteok',
      sourceJobId: String(j.id),
      title: stripHtml(j.position),
      company: j.company?.trim() || 'Confidential',
      locationRaw: location,
      description: stripHtml(j.description ?? ''),
      applyUrl: j.url,
      postedAt: toDate(j.date),
      compensationRaw: salaryText(j.salary_min, j.salary_max, 'USD per year'),
    });
  },
};

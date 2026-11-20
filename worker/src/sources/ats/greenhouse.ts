import { stripHtml, truncate } from '@beep/shared';
import { isIndiaLocation, unescapeHtml } from './india.ts';
import type { PlatformDef, Posting } from './types.ts';

interface GhJob {
  id?: number | string;
  title?: string;
  location?: { name?: string };
  absolute_url?: string;
  first_published?: string;
  updated_at?: string;
  content?: string;
  offices?: Array<{ name?: string; location?: string | null }>;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const greenhouse: PlatformDef = {
  platform: 'greenhouse',
  description: 'Greenhouse Job Board API: public openings from companies that publish their board for embedding.',
  meta: {
    homepage: 'https://www.greenhouse.com/',
    accessMethod: 'public_ats_api',
    termsUrl: 'https://developers.greenhouse.io/job-board.html',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Checked 2026-11-18: Job Board API docs state "Job Board data is publicly available, so authentication is not required for any GET endpoints"; robots.txt on boards-api.greenhouse.io only disallows /embed/. No rate limit published; we make one request per board, 1 s apart per host, and link every post back to the company apply URL.',
  },
  boardUrl: (slug, full) =>
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs${full ? '?content=true' : ''}`,
  jobsOf: (json) => {
    const jobs = (json as { jobs?: unknown })?.jobs;
    return Array.isArray(jobs) ? jobs : null;
  },
  parse(raw): Posting | null {
    const j = raw as GhJob;
    if (j?.id == null || !str(j.title) || !str(j.absolute_url)) return null;
    const locations = [str(j.location?.name)];
    // Offices only matter when the posting's own location text does not already say India (e.g. plain "Remote").
    if (!isIndiaLocation(locations[0]!)) for (const o of j.offices ?? []) locations.push(str(o.location), str(o.name));
    const posted = str(j.first_published) || str(j.updated_at);
    return {
      id: String(j.id),
      title: str(j.title),
      locations: [...new Set(locations.filter(Boolean))],
      country: null,
      applyUrl: str(j.absolute_url),
      description: truncate(stripHtml(unescapeHtml(j.content ?? '')), 6000),
      postedAt: posted ? new Date(posted) : null,
      employmentType: null,
      compensation: null,
      remote: /remote/i.test(str(j.location?.name)),
    };
  },
};

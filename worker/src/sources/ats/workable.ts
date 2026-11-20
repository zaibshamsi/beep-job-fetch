import { stripHtml, truncate } from '@beep/shared';
import type { PlatformDef, Posting } from './types.ts';

interface WkJob {
  title?: string;
  shortcode?: string;
  employment_type?: string;
  telecommuting?: boolean;
  url?: string;
  application_url?: string;
  published_on?: string;
  created_at?: string;
  country?: string;
  city?: string;
  state?: string;
  description?: string;
  locations?: Array<{ country?: string; countryCode?: string; city?: string; region?: string }>;
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const workable: PlatformDef = {
  platform: 'workable',
  description: 'Workable account widget feed: public openings from companies that embed the Workable jobs widget.',
  meta: {
    homepage: 'https://www.workable.com/',
    accessMethod: 'public_ats_api',
    termsUrl: 'https://www.workable.com/terms',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Checked 2026-11-18: the widget feed (apply.workable.com/api/v1/widget/accounts/{slug}) is the unauthenticated JSON behind the embeddable careers widget; it is not in the token-based developer API docs. robots.txt on apply.workable.com allows all (Content-Signal ai-train=no; we only list and link, never train). Terms of use say nothing on public job feeds. Lower confidence than Greenhouse or Lever: the feed returned 429 at 1 req/s, so we send one request per board, 2.5 s apart, and back off on 429.',
  },
  minDelayMs: 2500, // the widget answers 429 at 1 req/s
  boardUrl: (slug, full) =>
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(slug)}${full ? '?details=true' : ''}`,
  jobsOf: (json) => {
    const jobs = (json as { jobs?: unknown })?.jobs;
    return Array.isArray(jobs) ? jobs : null;
  },
  boardName: (json) => str((json as { name?: unknown })?.name) || null,
  parse(raw): Posting | null {
    const j = raw as WkJob;
    const url = str(j?.url) || str(j?.application_url);
    if (!j?.shortcode || !str(j.title) || !url) return null;
    const join = (...p: Array<string | undefined>) => p.map(str).filter(Boolean).join(', ');
    const primary = join(j.city, j.state, j.country);
    const others = (j.locations ?? []).map((l) => join(l.city, l.region, l.country));
    const posted = str(j.published_on) || str(j.created_at);
    return {
      id: j.shortcode,
      title: str(j.title),
      locations: [...new Set([primary, ...others].filter(Boolean))],
      country: str(j.locations?.[0]?.countryCode) || str(j.country) || null,
      applyUrl: url,
      description: truncate(stripHtml(str(j.description)), 6000),
      postedAt: posted ? new Date(posted) : null,
      employmentType: str(j.employment_type) || null,
      compensation: null,
      remote: j.telecommuting === true,
    };
  },
};

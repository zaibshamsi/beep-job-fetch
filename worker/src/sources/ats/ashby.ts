import { stripHtml, truncate } from '@beep/shared';
import type { PlatformDef, Posting } from './types.ts';

interface AshbyJob {
  id?: string;
  title?: string;
  location?: string;
  secondaryLocations?: Array<{ location?: string }>;
  address?: { postalAddress?: { addressCountry?: string } };
  employmentType?: string;
  publishedAt?: string;
  isListed?: boolean;
  isRemote?: boolean;
  jobUrl?: string;
  applyUrl?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export const ashby: PlatformDef = {
  platform: 'ashby',
  description: 'Ashby Job Postings API: public openings from companies that publish their Ashby job board.',
  meta: {
    homepage: 'https://www.ashbyhq.com/',
    accessMethod: 'public_ats_api',
    termsUrl: 'https://developers.ashbyhq.com/docs/public-job-posting-api',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Checked 2026-11-18: the Job Postings API is documented as a plain unauthenticated GET for showing a company board elsewhere; the docs publish no rate limit or extra terms, and api.ashbyhq.com serves no robots.txt (401). We make one request per board, 1 s apart per host, and link back to the hosted job page.',
  },
  boardUrl: (slug, full) =>
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}${full ? '?includeCompensation=true' : ''}`,
  jobsOf: (json) => {
    const jobs = (json as { jobs?: unknown })?.jobs;
    return Array.isArray(jobs) ? jobs : null;
  },
  parse(raw): Posting | null {
    const j = raw as AshbyJob;
    const url = str(j?.jobUrl) || str(j?.applyUrl);
    if (!j?.id || !str(j.title) || !url || j.isListed === false) return null;
    const locations = [str(j.location), ...(j.secondaryLocations ?? []).map((s) => str(s.location))].filter(Boolean);
    const published = str(j.publishedAt);
    return {
      id: j.id,
      title: str(j.title),
      locations: [...new Set(locations)],
      country: str(j.address?.postalAddress?.addressCountry) || null,
      applyUrl: url,
      description: truncate(str(j.descriptionPlain) || stripHtml(str(j.descriptionHtml)), 6000),
      postedAt: published ? new Date(published) : null,
      employmentType: str(j.employmentType) || null,
      compensation:
        str(j.compensation?.compensationTierSummary) || str(j.compensation?.scrapeableCompensationSalarySummary) || null,
      remote: j.isRemote === true,
    };
  },
};

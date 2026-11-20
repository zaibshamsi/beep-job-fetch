import { stripHtml, truncate } from '@beep/shared';
import type { PlatformDef, Posting } from './types.ts';

interface LeverJob {
  id?: string;
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  country?: string;
  workplaceType?: string;
  descriptionPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  additionalPlain?: string;
  categories?: { location?: string; allLocations?: string[]; commitment?: string };
  salaryRange?: { currency?: string; interval?: string; min?: number; max?: number };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function salary(r: LeverJob['salaryRange']): string | null {
  if (!r || (r.min == null && r.max == null)) return null;
  const range = r.min != null && r.max != null ? `${r.min}-${r.max}` : String(r.min ?? r.max);
  return [r.currency, range, r.interval].filter(Boolean).join(' ');
}

export const lever: PlatformDef = {
  platform: 'lever',
  description: 'Lever Postings API: public openings from companies that publish their Lever job site.',
  meta: {
    homepage: 'https://www.lever.co/',
    accessMethod: 'public_ats_api',
    termsUrl: 'https://github.com/lever/postings-api',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Checked 2026-11-18: Postings API docs say list/get return only published postings, which are publicly viewable and "may be scraped by third parties"; reads need no key. robots.txt on api.lever.co allows all with Crawl-delay 1, which we honour (1 s per host). Lever recommends linking to the hosted posting, which is what we do.',
  },
  boardUrl: (slug) => `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
  jobsOf: (json) => (Array.isArray(json) ? json : null),
  parse(raw): Posting | null {
    const j = raw as LeverJob;
    const url = str(j?.hostedUrl) || str(j?.applyUrl);
    if (!j?.id || !str(j.text) || !url) return null;
    const cats = j.categories ?? {};
    const locations = [str(cats.location), ...(cats.allLocations ?? []).map(str)].filter(Boolean);
    const body = [
      str(j.descriptionPlain),
      ...(j.lists ?? []).map((l) => `${str(l.text)}\n${stripHtml(str(l.content))}`),
      str(j.additionalPlain),
    ]
      .filter(Boolean)
      .join('\n\n');
    return {
      id: j.id,
      title: str(j.text),
      locations: [...new Set(locations)],
      country: str(j.country) || null,
      applyUrl: url,
      description: truncate(body, 6000),
      postedAt: typeof j.createdAt === 'number' ? new Date(j.createdAt) : null,
      employmentType: str(cats.commitment) || null,
      compensation: salary(j.salaryRange),
      remote: str(j.workplaceType).toLowerCase() === 'remote',
    };
  },
};

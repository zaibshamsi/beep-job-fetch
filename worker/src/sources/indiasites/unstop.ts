import { politeFetch, stripHtml, truncate, type JobPost, type RawPost, type SourceAdapter } from '@beep/shared';
import { isSeniorTitle, parseDate } from './common.ts';

const API = 'https://unstop.com/api/public/opportunity/search-result';
const SITE = 'https://unstop.com';
const PER_PAGE = 50;
const MAX_PAGES_PER_KIND = 3;
const MIN_DELAY_MS = 2500;
/** Unstop calls the internship feed "internships" and the job feed "jobs". */
const KINDS = ['internships', 'jobs'] as const;

export interface UnstopItem {
  id: number;
  public_url?: string;
  seo_url?: string;
  title?: string;
  subtype?: string;
  status?: string;
  visibility?: string;
  details?: string;
  approved_date?: string;
  updated_at?: string;
  organisation?: { name?: string };
  locations?: { city?: string; state?: string; country?: string }[];
  jobDetail?: {
    type?: string; // wfh | in_office | hybrid
    timing?: string;
    locations?: string[];
    min_salary?: number | null;
    max_salary?: number | null;
    show_salary?: number;
    pay_in?: string;
    paid_unpaid?: string;
  };
  regnRequirements?: { eligibility?: string };
}

function compensation(d: UnstopItem['jobDetail']): string | null {
  if (!d) return null;
  if (d.paid_unpaid === 'unpaid') return 'Unpaid';
  if (!d.show_salary || (!d.min_salary && !d.max_salary)) return null;
  const range = d.min_salary && d.max_salary && d.min_salary !== d.max_salary ? `${d.min_salary}-${d.max_salary}` : `${d.max_salary || d.min_salary}`;
  return `INR ${range} per ${d.pay_in === 'annually' ? 'year' : 'month'}`;
}

function sectors(item: UnstopItem): string[] {
  try {
    const parsed = JSON.parse(item.regnRequirements?.eligibility ?? '{}') as { sector?: string[] };
    return parsed.sector ?? [];
  } catch {
    return [];
  }
}

/** India only: a listed non-India country rejects the post; no location at all means online/remote, which Unstop serves to Indian students. */
function location(item: UnstopItem): string | null {
  const locs = item.locations ?? [];
  if (locs.length) {
    const indian = locs.filter((l) => !l.country || /^india$/i.test(l.country));
    if (!indian.length) return null;
    return indian.map((l) => [l.city, l.state].filter(Boolean).join(', ')).join(' | ');
  }
  const cities = item.jobDetail?.locations ?? [];
  if (cities.length) return cities.join(' | ');
  return 'Remote, India';
}

export function normalizeUnstop(raw: RawPost): JobPost | null {
  const item = raw.payload as UnstopItem;
  const title = item.title?.trim();
  const company = item.organisation?.name?.trim();
  if (!title || !company || item.status !== 'LIVE' || item.visibility !== 'public') return null;
  if (isSeniorTitle(title)) return null;
  const locationRaw = location(item);
  if (locationRaw === null) return null;
  const path = item.seo_url ?? (item.public_url ? `${SITE}/${item.public_url}` : null);
  if (!path) return null;

  const hint = item.subtype === 'internships' ? 'internship' : sectors(item).includes('fresher') ? 'fresher' : 'none';
  return {
    source: raw.source,
    sourceJobId: String(item.id),
    title,
    company,
    locationRaw: item.jobDetail?.type === 'wfh' && locationRaw !== 'Remote, India' ? `${locationRaw} (Remote)` : locationRaw,
    description: truncate(stripHtml(item.details ?? ''), 1500),
    applyUrl: path,
    postedAt: parseDate(item.approved_date) ?? parseDate(item.updated_at),
    employmentTypeRaw: [item.subtype === 'internships' ? 'Internship' : 'Job', item.jobDetail?.timing].filter(Boolean).join(' ').replace('_', ' '),
    compensationRaw: compensation(item.jobDetail),
    sourceHint: hint,
  };
}

export const unstop: SourceAdapter = {
  name: 'unstop',
  description: 'Unstop (formerly Dare2Compete) internships and jobs for students and freshers, via its public opportunity API.',
  meta: {
    homepage: 'https://unstop.com',
    accessMethod: 'feed',
    termsUrl: 'https://unstop.com/legal/terms-of-use',
    termsStatus: 'allowed_with_limits',
    termsNotes:
      'Checked 2026-11-18. robots.txt for * explicitly Allows /internship/, /job/ and /api/public/* (Disallow /api/* otherwise); we only call ' +
      '/api/public/opportunity/search-result. The Terms of Use (rendered page read in a browser) contain no clause on crawling, scraping or automated access. ' +
      `Limits: robots.txt enforced, >= ${MIN_DELAY_MS} ms between requests, at most ${MAX_PAGES_PER_KIND} pages x ${PER_PAGE} per feed per run, ` +
      'we keep title/company/location/short description/link and always link back to unstop.com. Terms are silent on reuse, so owner should confirm.',
  },
  unavailableReason: () => null,
  async fetch(ctx) {
    const out: RawPost[] = [];
    const perKind = Math.ceil(ctx.maxPostsPerSource / KINDS.length);
    for (const kind of KINDS) {
      const start = out.length;
      for (let page = 1; page <= MAX_PAGES_PER_KIND; page++) {
        if (ctx.signal?.aborted || out.length - start >= perKind) break;
        const url = `${API}?opportunity=${kind}&per_page=${PER_PAGE}&page=${page}`;
        try {
          const res = await politeFetch(url, { minDelayMs: MIN_DELAY_MS, signal: ctx.signal, headers: { accept: 'application/json' } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = (await res.json()) as { data?: { data?: UnstopItem[]; last_page?: number } };
          const items = body.data?.data ?? [];
          for (const item of items) {
            if (out.length - start >= perKind) break;
            if (item?.id) out.push({ source: 'unstop', sourceJobId: String(item.id), payload: item });
          }
          ctx.log.info(`unstop ${kind} page ${page}: ${items.length} items`);
          if (items.length < PER_PAGE || page >= (body.data?.last_page ?? page)) break;
        } catch (err) {
          ctx.log.warn(`unstop ${kind} page ${page} failed: ${(err as Error).message}`);
          break;
        }
      }
    }
    return out;
  },
  normalize: normalizeUnstop,
};

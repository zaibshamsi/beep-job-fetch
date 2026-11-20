/** Pure helpers for the landing page: formatters and the builders that turn API data into display rows. */
import type { CitySummary, JobDetail, JobListItem, SourceStatus, Stats } from '../../api/types.ts';
import { JOB_TYPE_LABEL } from '../../api/types.ts';
import { sourceName } from '../jobs/sources.ts';

export const fmtNum = (n: number) => n.toLocaleString('en-IN');

const IST = 'Asia/Kolkata';

/** "19 Nov" and "06:23" for an ISO instant, in Indian Standard Time. Null for a missing or invalid date. */
export function formatIst(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('day')} ${get('month')}`, time: `${get('hour')}:${get('minute')}` };
}

const inr = (n: number) => '₹' + fmtNum(n);

/** "₹1,000–1,500/mo", "₹5,000/mo", or null when no stipend is known. */
export function formatStipendShort(min: number | null, max: number | null): string | null {
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo == null || hi == null || (lo <= 0 && hi <= 0)) return null;
  return hi > lo ? `${inr(lo)}–${fmtNum(hi)}/mo` : `${inr(lo)}/mo`;
}

/** "₹5,000 to ₹15,000 a month" for the tagging demo. */
export function formatStipendLong(min: number | null, max: number | null): string | null {
  const lo = min ?? max;
  const hi = max ?? min;
  if (lo == null || hi == null || (lo <= 0 && hi <= 0)) return null;
  return hi > lo ? `${inr(lo)} to ${inr(hi)} a month` : `${inr(lo)} a month`;
}

/* ---------- sources ---------- */

export const isAllowed = (s: SourceStatus) => s.termsStatus === 'allowed' || s.termsStatus === 'allowed_with_limits';
export const allowedSourceCount = (sources: SourceStatus[]) => sources.filter(isAllowed).length;
export const sourcesWithJobs = (sources: SourceStatus[]) => sources.filter((s) => s.activeJobs > 0).length;

const ACCESS_LABEL: Record<string, string> = {
  feed: 'Public feed',
  public_ats_api: 'Public job-board API',
  official_api: 'Official API',
  jsonld: 'Structured data on career pages',
  sitemap: 'Sitemap',
};

export function accessLabel(method: string | null): string {
  if (!method) return 'Public source';
  return ACCESS_LABEL[method] ?? method.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export interface ReadingRow {
  key: string;
  name: string;
  detail: string;
  count: number;
  /** Bar width, 0 to 100, relative to the largest row. */
  pct: number;
}

/**
 * Reading list: the allowed sources that have jobs, biggest first. The top `top` rows are named; every other source with
 * jobs folds into one "N more sources" row that sums their jobs.
 */
export function buildReadingList(sources: SourceStatus[], top = 3): ReadingRow[] {
  const live = sources.filter((s) => isAllowed(s) && s.activeJobs > 0).sort((a, b) => b.activeJobs - a.activeJobs || a.name.localeCompare(b.name));
  if (live.length === 0) return [];
  const max = live[0].activeJobs;
  const pct = (n: number) => Math.min(100, Math.round((n / max) * 100));
  const rows: ReadingRow[] = live.slice(0, top).map((s) => ({
    key: s.name,
    name: sourceName(s.name),
    detail: accessLabel(s.accessMethod),
    count: s.activeJobs,
    pct: pct(s.activeJobs),
  }));
  const rest = live.slice(top);
  if (rest.length) {
    const jobs = rest.reduce((a, s) => a + s.activeJobs, 0);
    rows.push({
      key: '__rest',
      name: `${rest.length} more ${rest.length === 1 ? 'source' : 'sources'}`,
      detail: rest.map((s) => sourceName(s.name)).join(', '),
      count: jobs,
      pct: pct(jobs),
    });
  }
  return rows;
}

/** Sites reviewed and refused, with the reason from docs/SOURCE_REVIEW.md (review of 2026-11-18). */
export const SKIPPED_SITES: { name: string; reason: string }[] = [
  { name: 'LinkedIn', reason: 'robots.txt: Disallow: /; user agreement bans scraping' },
  { name: 'Naukri', reason: 'Blocks our crawler; terms reported to ban scraping' },
  { name: 'Indeed', reason: 'Job pages disallowed in robots.txt; terms ban bots' },
  { name: 'Internshala', reason: 'Terms ban scraping; job pages disallowed in robots.txt' },
  { name: 'Glassdoor', reason: 'Terms ban scraping; job pages disallowed in robots.txt' },
];

/* ---------- cities ---------- */

/** Beacon radius in viewBox units (DESIGN.md section 8). */
export const beaconRadius = (n: number) => (n > 0 ? 4 + Math.sqrt(n) * 1.6 : 2.5);

/** Cities that get a permanent label on the stage: 36 or more jobs, or the top four. */
export function labelledCities(cities: CitySummary[]): Set<string> {
  const sorted = [...cities].sort((a, b) => b.count - a.count);
  const out = new Set<string>(sorted.slice(0, 4).map((c) => c.city));
  for (const c of cities) if (c.count >= 36) out.add(c.city);
  return out;
}

export interface MarqueeItem {
  name: string;
  count: number;
}

/** Top cities by job count, then Remote last (when there are remote jobs). */
export function marqueeItems(cities: CitySummary[], remote: number, top = 18): MarqueeItem[] {
  const items = [...cities]
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
    .slice(0, top)
    .map((c) => ({ name: c.city, count: c.count }));
  if (remote > 0) items.push({ name: 'Remote', count: remote });
  return items;
}

export function cityBars(byCity: { city: string; count: number }[], top = 8) {
  const rows = [...byCity].sort((a, b) => b.count - a.count).slice(0, top);
  const max = rows[0]?.count ?? 0;
  return rows.map((r) => ({ ...r, pct: max ? Math.round((r.count / max) * 100) : 0 }));
}

/* ---------- tagging demo ---------- */

export type TagBy = 'rules' | 'jev' | 'llm' | 'source' | 'pending' | 'none';

export interface TaggingRow {
  key: 'city' | 'stipend' | 'type' | 'role' | 'skills';
  label: string;
  raw: string | null;
  value: string;
  by: TagBy;
  /** Tagging step (0 rules, 1 Jev, 2 LLM) at which the row lights up in the demo. */
  step: 0 | 1 | 2;
}

/** First post that has a city; the list is fetched with internship + stipend filters. */
export const pickDemoJob = (items: JobListItem[]): JobListItem | undefined => items.find((j) => j.cities.length > 0);

/**
 * Rows for the tagging demo, from a real post. The badge shows who really tagged the field (`taggedBy`). When the post
 * has no `taggedBy`, city, stipend and job type are rules; role and skills are "pending" if the post still needs review
 * (AI has not looked at it), otherwise rules.
 */
export function taggingRows(job: JobDetail): TaggingRow[] {
  const tb = job.taggedBy;
  const pick = (keys: string[], fallback: TagBy): TagBy => {
    for (const k of keys) {
      const v = tb?.[k];
      if (v) return v;
    }
    return fallback;
  };
  const aiFallback: TagBy = job.needsReview ? 'pending' : 'rules';
  const stipend = formatStipendLong(job.stipendMinMonthlyInr, job.stipendMaxMonthlyInr);
  const skills = job.skills.length ? job.skills.join(', ') : null;
  return [
    { key: 'city', label: 'City', raw: job.locationRaw, value: job.cities[0] ?? 'Not found', by: pick(['cities'], 'rules'), step: 0 },
    {
      key: 'stipend',
      label: 'Stipend',
      raw: job.compensationRaw,
      value: stipend ?? 'Not stated',
      by: pick(['stipendMinMonthlyInr', 'stipendMaxMonthlyInr'], 'rules'),
      step: 0,
    },
    {
      key: 'type',
      label: 'Job type',
      raw: job.employmentTypeRaw,
      value: job.jobType ? JOB_TYPE_LABEL[job.jobType] : 'Not found',
      by: pick(['jobType'], 'rules'),
      step: 0,
    },
    { key: 'role', label: 'Role', raw: job.title, value: job.roleCategory ?? 'Not tagged yet', by: pick(['roleCategory'], aiFallback), step: 1 },
    {
      key: 'skills',
      label: 'Skills',
      raw: null,
      value: skills ?? 'None found in this post',
      by: tb?.skills ?? (skills ? aiFallback : job.needsReview ? 'pending' : 'none'),
      step: 2,
    },
  ];
}

export const TAG_BY_LABEL: Record<TagBy, string> = {
  rules: 'rules',
  jev: 'jev',
  llm: 'llm',
  source: 'source',
  pending: 'not yet tagged by AI',
  none: 'none found',
};

/* ---------- numbers ---------- */

/** The honest closing line of the numbers section: real cost and accuracy from /stats, or "not measured yet". */
export function qualityLine(stats: Stats): string {
  const per1000 = stats.costPer1000?.tagging?.per1000Posts;
  const pct = stats.accuracy?.overall?.percent;
  const checked = stats.accuracy?.labelledJobs ?? 0;
  const cost = per1000 == null ? 'not measured yet' : `$${per1000.toFixed(per1000 < 1 ? 3 : 2)}`;
  const accuracy = pct == null ? 'not measured yet' : `${Math.round(pct)}%`;
  const on = checked > 0 ? ` on ${fmtNum(checked)} hand-checked posts` : ' on hand-checked posts';
  return `Cost per 1,000 posts tagged: ${cost}. Tagging accuracy${on}: ${accuracy}.`;
}

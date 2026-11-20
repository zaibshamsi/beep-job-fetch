import { JobPostSchema, truncate, type JobPost } from '@beep/shared';

/** Titles we drop up front to keep volume sane (ENGINEERING.md: senior-looking titles only). */
const SENIOR_TITLE = /\b(senior|sr\.?|lead|principal|director|manager|architect|staff|head|vp|vice president)\b/i;
export const isSeniorTitle = (title: string) => SENIOR_TITLE.test(title);

/**
 * Remote boards publish a free-text "candidates may live in" field. We keep a post only when that
 * text explicitly includes India, Asia/APAC or worldwide/anywhere, and say so in locationRaw so the
 * enrichment rules tag it as remote.
 */
const INDIA_ELIGIBLE = /\b(india|apac|asia|worldwide|anywhere|global)\b/i;
const REGION_LOCKED = /anywhere in (the )?(us|usa|united states|europe|canada|uk|latam)\b/i;
export const REMOTE_INDIA_LOCATION = 'Remote (India eligible)';

export function remoteIndiaLocation(eligibleText: string | null | undefined): string | null {
  const t = (eligibleText ?? '').trim();
  if (!t || REGION_LOCKED.test(t) || !INDIA_ELIGIBLE.test(t)) return null;
  return REMOTE_INDIA_LOCATION;
}

export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  // Some feeds send zone-less timestamps; they are UTC, so pin the zone instead of using the host's.
  const text = String(value).replace(/(T\d\d:\d\d:\d\d(?:\.\d+)?)$/, '$1Z');
  const d = typeof value === 'number' ? new Date(value * 1000) : new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

type PostInput = Parameters<typeof JobPostSchema.parse>[0];

/** Final gate for every adapter: trims the description and rejects anything the schema rejects. */
export function toJobPost(post: PostInput): JobPost | null {
  const p = post as Record<string, unknown>;
  const description = typeof p.description === 'string' ? truncate(p.description, 4000) : '';
  const res = JobPostSchema.safeParse({ ...p, description });
  return res.success ? res.data : null;
}

/** "INR 300,000 - 400,000 per year" style text; null when there is no figure. */
export function salaryText(min: number | null | undefined, max: number | null | undefined, unit: string): string | null {
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  if (min && max && min !== max) return `${fmt(min)} - ${fmt(max)} ${unit}`;
  const one = max || min;
  return one ? `${fmt(one)} ${unit}` : null;
}

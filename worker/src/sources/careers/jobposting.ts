import * as cheerio from 'cheerio';
import { JobPostSchema, stripHtml, truncate, type JobPost, type RawPost } from '@beep/shared';
import { isIndiaLocation, isSeniorTitle } from './filters.ts';

type Json = Record<string, any>;

function parseLoose(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Some sites leave raw newlines/tabs inside JSON strings.
    try {
      return JSON.parse(text.replace(/[\u0000-\u001f]+/g, ' '));
    } catch {
      return null;
    }
  }
}

const isJobPosting = (o: Json): boolean => {
  const t = o['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
};

function collect(node: unknown, out: Json[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => collect(n, out));
  const o = node as Json;
  if (isJobPosting(o)) out.push(o);
  if (o['@graph']) collect(o['@graph'], out);
}

/** All schema.org JobPosting objects found in the page's JSON-LD blocks. */
export function extractJobPostings(html: string): Json[] {
  const $ = cheerio.load(html);
  const out: Json[] = [];
  $('script[type="application/ld+json"]').each((_, el) => collect(parseLoose($(el).text()), out));
  return out;
}

const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const nameOf = (v: unknown): string => (typeof v === 'object' && v ? str((v as Json).name) : str(v));

/** Values some sites emit in place of a missing address part. */
const PLACEHOLDER = /^(unavailable|unknown|n\/a|na|none|null|(state )?not applicable)$/i;

interface Place {
  text: string;
  country: string;
}

function places(jp: Json): Place[] {
  const out: Place[] = [];
  for (const loc of arr<Json | string>(jp.jobLocation)) {
    if (typeof loc === 'string') {
      out.push({ text: loc, country: '' });
      continue;
    }
    const a = (loc.address ?? loc) as Json;
    if (typeof a === 'string') {
      out.push({ text: a, country: '' });
      continue;
    }
    const country = nameOf(a.addressCountry);
    const text = [a.streetAddress, a.addressLocality, a.addressRegion, country, loc.name]
      .map(str)
      .filter((v) => v && !PLACEHOLDER.test(v))
      .join(', ');
    if (text) out.push({ text, country });
  }
  return out;
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Descriptions are often HTML that has itself been entity-escaped; unescape first so stripHtml sees the tags. */
export function descriptionText(raw: string): string {
  const html = /&lt;\s*\/?[a-z]/i.test(raw) ? decodeEntities(raw) : raw;
  return truncate(stripHtml(html), 6000);
}

function salary(jp: Json): string | null {
  const bs = jp.baseSalary as Json | undefined;
  if (!bs || typeof bs !== 'object') return null;
  const v = (bs.value ?? bs) as Json;
  const cur = str(bs.currency) || str(v.currency);
  const min = v.minValue ?? v.value;
  const max = v.maxValue;
  if (min == null && max == null) return null;
  const range = max != null && max !== min ? `${min ?? ''}-${max}` : `${min}`;
  return [cur, range, str(v.unitText)].filter(Boolean).join(' ');
}

/** Dates without a zone are read as UTC so results do not depend on the server's timezone. */
function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s) ? `${s}Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function absolute(url: string, base: string): string | null {
  try {
    const u = new URL(url, base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface CareersPayload {
  site: string; // company display name
  slug: string;
  pageUrl: string;
  jobPosting: Json;
}

/** Stable per-site id: the posting identifier, else its page URL. */
export const jobKey = (p: CareersPayload): string =>
  `${p.slug}:${str(p.jobPosting.identifier?.value ?? p.jobPosting.identifier) || p.pageUrl}`.slice(0, 400);

/** Map one JSON-LD JobPosting to a JobPost. Returns null for non-India, expired, senior or malformed postings. */
export function normalizeJobPosting(raw: RawPost, source: string, now = new Date()): JobPost | null {
  const p = raw.payload as CareersPayload;
  const jp = p?.jobPosting;
  if (!jp) return null;

  const title = stripHtml(decodeEntities(str(jp.title))).replace(/\s+/g, ' ');
  if (title.length < 2 || isSeniorTitle(title)) return null;

  const valid = parseDate(str(jp.validThrough));
  if (valid && valid.getTime() < now.getTime() - 86_400_000) return null;

  const ps = places(jp);
  const remoteIndia = arr<Json>(jp.applicantLocationRequirements).map(nameOf);
  const locText = ps.map((x) => x.text).join('; ');
  const countries = [...ps.map((x) => x.country), ...remoteIndia.filter(Boolean)].filter(Boolean);
  if (!isIndiaLocation([locText, ...remoteIndia].join('; '), countries)) return null;

  const posted = parseDate(str(jp.datePosted));
  const applyUrl = absolute(str(jp.url), p.pageUrl) ?? p.pageUrl;

  const parsed = JobPostSchema.safeParse({
    source,
    sourceJobId: jobKey(p),
    title,
    company: p.site,
    locationRaw: truncate(locText || remoteIndia.join('; '), 500),
    description: descriptionText(str(jp.description)),
    applyUrl,
    postedAt: posted,
    employmentTypeRaw: arr<string>(jp.employmentType).map(str).filter(Boolean).join(', ') || null,
    compensationRaw: salary(jp),
  });
  return parsed.success ? parsed.data : null;
}

import { buildAliasIndex } from '@beep/shared';

/** Titles that are clearly not for freshers; dropping them keeps huge career sites from flooding a run. */
const SENIOR_TITLE = /\b(senior|sr\.?|lead|principal|director|manager|architect|staff|head|vp|vice president|chief|president|distinguished|fellow)\b/i;
export const isSeniorTitle = (title: string): boolean => SENIOR_TITLE.test(title);

const aliases = [...buildAliasIndex().keys()];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 'salt lake' is a Kolkata locality alias but far more often Salt Lake City, Utah.
const CITY_RE = new RegExp(`(?:^|[^a-z])(?:${aliases.map((a) => (a === 'salt lake' ? 'salt lake(?! city)' : escape(a))).join('|')})(?![a-z])`, 'i');
const INDIA_RE = /(?:^|[^a-z])india(?![a-z])/i;

const US_NAMESAKE_RE = /(?:^|[^a-z])(?:salem|madras|delhi|calcutta)(?![a-z])/i;
const US_STATE_SUFFIX = /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;

/** True when a country value is present and is India (name or ISO code). */
export const isIndiaCountry = (c: string): boolean => /^(in|ind|india|republic of india)$/i.test(c.trim());

/**
 * Location is India when the text says India or names a gazetteer city.
 * `countries` are explicit country values from structured data: if any are given and none is India, reject
 * even when a city name matches (e.g. Salem, Oregon).
 */
export function isIndiaLocation(text: string, countries: string[] = []): boolean {
  const known = countries.map((c) => c.trim()).filter(Boolean);
  if (known.length) return known.some(isIndiaCountry);
  if (INDIA_RE.test(text)) return true;
  // Same-named US places (Salem, OR; Delhi, NY) when no country is given: a US state suffix wins.
  if (US_NAMESAKE_RE.test(text) && US_STATE_SUFFIX.test(text)) return false;
  return CITY_RE.test(text);
}

/** Regex alternation of city names as they appear in URL slugs; sites may use it in urlPattern as {INDIA}. */
export const INDIA_URL_ALTERNATION = `(?:${[...aliases].sort((a, b) => b.length - a.length).map((a) => escape(a).replace(/ /g, "[-_+ ]")).join("|")})`;

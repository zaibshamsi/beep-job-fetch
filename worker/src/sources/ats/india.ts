import { CITIES } from '@beep/shared';

/** Names that are also well-known places elsewhere or too generic; they only count next to an explicit "India". */
const AMBIGUOUS = new Set(['salem', 'amaravati', 'ncr', 'salt lake', 'cyber city', 'cybercity', 'madras']);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliases = [...new Set(CITIES.flatMap((c) => [c.name, ...c.aliases]).map((a) => a.toLowerCase()))].filter(
  (a) => !AMBIGUOUS.has(a),
);
const CITY_RE = new RegExp(`(?<![a-z])(${aliases.map(esc).join('|')})(?![a-z])`, 'i');
const INDIA_RE = /(?<![a-z])india(?![a-z])|\bbharat\b/i;
const APAC_RE = /(?<![a-z])apac(?![a-z])|asia[- ]pacific/i;
const REMOTE_RE = /remote|anywhere|work from home|wfh/i;
const NOT_INDIA_COUNTRY = new RegExp(
  [
    String.raw`united states|\busa\b|\bu\.s\.|united kingdom|\buk\b|canada|pakistan|bangladesh|sri lanka|nepal`,
    String.raw`germany|france|australia|singapore|malaysia|indonesia|philippines|vietnam|thailand|japan|china|korea`,
    String.raw`taiwan|hong kong|emirates|\buae\b|saudi|qatar|kuwait|oman|bahrain|egypt|nigeria|kenya|south africa`,
    String.raw`brazil|mexico|argentina|colombia|ireland|spain|italy|netherlands|poland|romania|ukraine|turkey|israel|new zealand`,
  ].join('|'),
  'i',
);

/** True/false when the platform gave a country that is/is not India, null when it gave none. */
export function isIndiaCode(country: string | null): boolean | null {
  if (!country) return null;
  const c = country.trim().toLowerCase();
  if (!c) return null;
  return c === 'in' || c === 'ind' || c === 'india';
}

/** Is this one location string in India (or remote and open to India / APAC)? */
export function isIndiaLocation(text: string): boolean {
  if (!text) return false;
  if (INDIA_RE.test(text)) return true;
  if (APAC_RE.test(text) && REMOTE_RE.test(text)) return true;
  // A bare gazetteer city with another country named alongside ("Hyderabad, Pakistan") is not ours.
  return CITY_RE.test(text) && !NOT_INDIA_COUNTRY.test(text);
}

/**
 * Titles that are clearly not entry level. Interns and trainees with a senior-sounding noun
 * ("Product Manager Intern") are kept; the fresher filter decides later.
 */
const SENIOR_RE =
  /(?<![a-z])(senior|sr|lead|principal|director|manager|architect|staff|head|vp|vice president|chief|distinguished|fellow|president)(?![a-z])/i;
const FRESHER_TITLE_RE = /(?<![a-z])(intern|interns|internship|trainee|graduate|fresher|apprentice)(?![a-z])/i;

export function isSeniorTitle(title: string): boolean {
  return SENIOR_RE.test(title) && !FRESHER_TITLE_RE.test(title);
}

/**
 * Greenhouse sends HTML with its angle brackets entity-escaped (`&lt;p&gt;`).
 * Unescape once so stripHtml sees real tags.
 */
export function unescapeHtml(s: string): string {
  if (!s || s.includes('<')) return s;
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

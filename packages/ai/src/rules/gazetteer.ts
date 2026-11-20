/**
 * Fast city matching over the shared gazetteer. One precompiled regex over every alias,
 * longest alias first so "navi mumbai" wins over "mumbai".
 *
 * Two entry points:
 * - findCities: for job text. Strict about ambiguous tokens (Salem, Kota, NCR...).
 * - findCityInQuery: for what a user types in the search box. Lenient (lower case is normal)
 *   and expands "NCR" to the whole region.
 */
import { CITIES } from '@beep/shared';

const SHORT_CODES = new Set(['blr', 'hyd', 'ggn', 'ncr', 'bkc']);
/** Tokens that are also names of places abroad or common words: accepted only with India context. */
const NEEDS_CONTEXT = new Set(['kota', 'salem', 'vasco', 'salt lake', 'cyber city', 'cybercity', 'gift city']);

const STATES = [...new Set(CITIES.map((c) => c.state.toLowerCase())), 'orissa', 'uttaranchal'];
const INDIA_AFTER = new RegExp(`^\\s*,?\\s*(?:india|${STATES.map(escape).join('|')})(?![\\p{L}])`, 'iu');
const FOREIGN_AFTER =
  /^\s*,?\s*(?:kinabalu|bharu|malaysia|indonesia|usa|u\.s\.|united states|oregon|massachusetts|ohio|utah|or\b|ma\b|nh\b|city\b)/i;
const NCR_COMPANY_AFTER = /^\s*(?:corp|corporation|atleos|voyix|inc|ltd)/i;
const BANK_OF_BEFORE = /\bbank of\s+$/i;

const NCR_REGION = ['Delhi', 'Gurugram', 'Noida', 'Ghaziabad', 'Faridabad'];

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

const aliasToCity = new Map<string, string>();
for (const c of CITIES) {
  aliasToCity.set(c.name.toLowerCase(), c.name);
  for (const a of c.aliases) aliasToCity.set(a.toLowerCase(), c.name);
}

const aliasRe = new RegExp(
  `(?<![\\p{L}\\p{N}])(${[...aliasToCity.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')})(?![\\p{L}\\p{N}])`,
  'giu',
);

/** True when the match sits alone between list separators, like "Pune / Kota" or "(Salem)". */
function isStandalone(text: string, start: number, end: number): boolean {
  let i = start - 1;
  while (i >= 0 && text[i] === ' ') i--;
  let j = end;
  while (j < text.length && text[j] === ' ') j++;
  const before = i < 0 || ',;/|(-–—:'.includes(text[i]!) || text[i] === '\n';
  const after = j >= text.length || ',;/|).-–—'.includes(text[j]!) || text[j] === '\n';
  return before && after;
}

function accept(text: string, alias: string, raw: string, start: number, end: number, strict: boolean): boolean {
  if (alias === 'baroda' && BANK_OF_BEFORE.test(text.slice(Math.max(0, start - 10), start))) return false;
  if (SHORT_CODES.has(alias)) {
    if (strict && raw !== raw.toUpperCase()) return false;
    if (alias === 'ncr' && NCR_COMPANY_AFTER.test(text.slice(end, end + 14))) return false;
  }
  if (NEEDS_CONTEXT.has(alias)) {
    const after = text.slice(end, end + 30);
    if (FOREIGN_AFTER.test(after)) return false;
    if (strict && !INDIA_AFTER.test(after) && !isStandalone(text, start, end)) return false;
  }
  return true;
}

function scan(text: string, strict: boolean): { cities: string[]; ncr: boolean } {
  const out: string[] = [];
  let ncr = false;
  if (!text) return { cities: out, ncr };
  aliasRe.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = aliasRe.exec(text))) {
    const alias = m[1]!.toLowerCase().replace(/\s+/g, ' ');
    const city = aliasToCity.get(alias);
    if (!city || !accept(text, alias, m[1]!, m.index, m.index + m[1]!.length, strict)) continue;
    if (alias === 'ncr' || alias === 'delhi ncr') ncr = true;
    if (!out.includes(city)) out.push(city);
  }
  return { cities: out, ncr };
}

/** Canonical city names mentioned in job text, in order of appearance. "Delhi NCR" gives only Delhi. */
export function findCities(text: string): string[] {
  return scan(text, true).cities;
}

/** Canonical city names in a search query. "NCR" / "Delhi NCR" expands to the whole region. */
export function findCityInQuery(text: string): string[] {
  const { cities, ncr } = scan(text, false);
  if (!ncr) return cities;
  const set = new Set(cities);
  for (const c of NCR_REGION) set.add(c);
  return [...set];
}

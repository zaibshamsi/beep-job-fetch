import type { JobPost } from '@beep/shared';
import type { FresherVerdict } from '../contracts.ts';
import { extractExperience } from './experience.ts';

/** Title words that say "student / graduate role". */
const TITLE_YES: Array<[RegExp, string]> = [
  [/\binterns?\b|\binternships?\b/i, 'intern'],
  [/\btrainees?\b/i, 'trainee'],
  [/\bapprentice(?:ship)?s?\b/i, 'apprentice'],
  [/\bfreshers?\b/i, 'fresher'],
  [/entry[- ]level/i, 'entry-level'],
  [/(?<!post[- ]?)\bgraduates?\b/i, 'graduate'],
  [/\bcampus\s+(?:hire|hiring|recruitment|drive|placement)/i, 'campus'],
  [/\boff[- ]?campus\b/i, 'off-campus'],
  [/\bmass\s+(?:hiring|recruitment)/i, 'mass-hiring'],
  [/\bwalk[- ]?in\b/i, 'walk-in'],
  [/\bbatch\s+(?:of\s+)?20(?:2\d)\b|\b20(?:2\d)\s+(?:batch|graduates|pass[- ]?outs?)\b/i, 'batch'],
];

/** Strong evidence in an employment-type field or a description. */
const DESC_YES: Array<[RegExp, string]> = [
  [/\boff[- ]?campus\b/i, 'off-campus'],
  [/\bcampus\s+(?:hiring|recruitment|drive)/i, 'campus'],
  [/\bmass\s+(?:hiring|recruitment)/i, 'mass-hiring'],
  [/\bwalk[- ]?in\s+(?:drive|interview)/i, 'walk-in'],
  [/\bbatch\s+(?:of\s+)?20(?:2\d)\b|\b20(?:2\d)\s+(?:batch|graduates|pass[- ]?outs?)\b/i, 'batch'],
  [/\brecent\s+graduates?\b|\bfresh\s+graduates?\b/i, 'recent-graduate'],
  [/\bfreshers?\b(?![^.\n]{0,30}experienced)/i, 'fresher'],
  [/entry[- ]level(?![^.\n]{0,40}senior)/i, 'entry-level'],
];

const ETYPE_YES = /intern|trainee|apprentice|fresher/i;

/** Hard no: seniority is part of the title. Beats everything. */
const TITLE_NO_HARD: Array<[RegExp, string]> = [
  [/\bsenior\b|\bsr\b/i, 'senior'],
  [/\bprincipal\b/i, 'principal'],
  [/\barchitect\b/i, 'architect'],
  [/\bvp\b|vice[- ]president|\bavp\b/i, 'vp'],
  [/\bhead of\b/i, 'head-of'],
  [/\b(?:sde|swe)[- ]?(?:ii|iii|iv|2|3|4)\b|\blevel (?:ii|iii|2|3)\b|\b(?:engineer|developer|analyst|designer|consultant) (?:ii|iii|iv|2|3|4)\b/i, 'level-2+'],
];
/** Soft no: overridden by an explicit trainee/intern word ("Trainee Manager"). */
const TITLE_NO_SOFT: Array<[RegExp, string]> = [
  [/\blead\b(?!\s+(?:generation|gen|qualification|management))/i, 'lead'],
  [/\bstaff\b(?!\s+nurse)/i, 'staff'],
  [/\bdirector\b/i, 'director'],
  [/\bhead\b/i, 'head'],
  [/\bmanagers?\b/i, 'manager'],
  [/\bchief\b|\bcto\b|\bceo\b|\bcfo\b/i, 'chief'],
];
const JUNIOR = /\b(?:junior|jr)\b/i;

function firstMatch(table: Array<[RegExp, string]>, text: string): string | null {
  for (const [re, name] of table) if (re.test(text)) return name;
  return null;
}

/**
 * Rules-only fresher verdict. Title signals beat description boilerplate; numeric experience
 * beats keywords; a source that is itself a fresher board counts unless the title is senior.
 */
export function fresherCheck(post: JobPost): { verdict: FresherVerdict; reason: string } {
  const title = post.title;
  const etype = post.employmentTypeRaw ?? '';
  const desc = post.description.slice(0, 4000);

  const titleYes = firstMatch(TITLE_YES, title);
  const hardNo = firstMatch(TITLE_NO_HARD, title);
  const softNo = firstMatch(TITLE_NO_SOFT, title);

  if (titleYes) {
    if (hardNo) return { verdict: 'no', reason: `title:${hardNo}` };
    return { verdict: 'yes', reason: `title:${titleYes}` };
  }
  if (hardNo || softNo) return { verdict: 'no', reason: `title:${hardNo ?? softNo}` };

  if (ETYPE_YES.test(etype)) return { verdict: 'yes', reason: `employment-type:${ETYPE_YES.exec(etype)![0].toLowerCase()}` };
  if (post.sourceHint !== 'none') return { verdict: 'yes', reason: `source-hint:${post.sourceHint}` };

  const exp = extractExperience(title, desc);
  const junior = JUNIOR.test(title);
  if (exp.min !== null) {
    const label = exp.max === null ? `${exp.min}+` : `${exp.min}-${exp.max}`;
    if (exp.min >= 2) return { verdict: 'no', reason: `experience:${label}` };
    if ((exp.min === 0 && (exp.max ?? 0) <= 2) || (exp.max !== null && exp.max <= 1)) {
      return { verdict: 'yes', reason: `experience:${label}` };
    }
    if (junior && exp.min <= 1) return { verdict: 'yes', reason: `junior+experience:${label}` };
  }

  const dy = firstMatch(DESC_YES, desc);
  if (dy) return { verdict: 'yes', reason: `description:${dy}` };
  if (junior) return { verdict: 'unknown', reason: 'junior-without-experience' };
  return { verdict: 'unknown', reason: 'no-signal' };
}

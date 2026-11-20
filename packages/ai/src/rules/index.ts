/**
 * Rule tagger: no network, no cost. Fills every field the keywords and regexes are sure about;
 * the Jev / LLM stages only handle what is left.
 */
import type { JobPost } from '@beep/shared';
import type { RuleTagResult } from '../contracts.ts';
import { parseCompensation } from './compensation.ts';
import { extractExperience } from './experience.ts';
import { fresherCheck } from './fresher.ts';
import { findCities } from './gazetteer.ts';
import { guessRole } from './role.ts';
import { extractSkills } from './skills.ts';
import { jobTypeHint, workModeHint } from './tags.ts';

export { fresherCheck };

const MAX_CITIES = 12;
const NO_SPECIFIC_CITY = /\bpan[- ]?india\b|\bmultiple (?:locations|cities)\b|\bacross india\b|\ball india\b|^\s*(?:remote|work from home|wfh|anywhere)\b[\s,()-]*(?:india)?\s*$/i;
const DESCRIPTION_HEADER_CHARS = 400;

/** locationRaw first, then the title, then the top of the description. */
function resolveCities(post: JobPost): string[] {
  const fromLocation = findCities(post.locationRaw);
  if (fromLocation.length) return fromLocation.slice(0, MAX_CITIES);
  if (NO_SPECIFIC_CITY.test(post.locationRaw)) return [];
  const fromTitle = findCities(post.title);
  if (fromTitle.length) return fromTitle.slice(0, MAX_CITIES);
  return findCities(post.description.slice(0, DESCRIPTION_HEADER_CHARS)).slice(0, MAX_CITIES);
}

export function ruleTag(post: JobPost): RuleTagResult {
  const description = post.description.slice(0, 6000);
  const role = guessRole(post.title, description);
  const exp = extractExperience(post.title, description);
  const pay = parseCompensation(post.compensationRaw, description);

  return {
    cities: resolveCities(post),
    workModeHint: workModeHint(`${post.title} ${post.locationRaw} ${post.employmentTypeRaw ?? ''}`, description),
    jobTypeHint: jobTypeHint(post.title, post.employmentTypeRaw, post.sourceHint),
    roleHint: role.role,
    roleConfidence: role.confidence,
    fresher: fresherCheck(post).verdict,
    experienceMinYears: exp.min,
    experienceMaxYears: exp.max,
    stipendMinMonthlyInr: pay.min,
    stipendMaxMonthlyInr: pay.max,
    skills: extractSkills(post.title, description),
  };
}

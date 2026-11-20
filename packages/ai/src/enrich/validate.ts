import { REMOTE, buildAliasIndex, cityByName } from '@beep/shared';
import type { AskField, LlmTag } from '../providers/llm-prompts.v1.ts';

const aliasIndex = buildAliasIndex();

/** Canonical gazetteer name for a city string ("Bangalore" -> "Bengaluru"), "Remote", or null when unknown. */
export function canonicalCity(name: string): string | null {
  const t = name.trim();
  if (!t) return null;
  if (t.toLowerCase() === REMOTE.toLowerCase()) return REMOTE;
  if (cityByName.has(t)) return t;
  return aliasIndex.get(t.toLowerCase()) ?? null;
}

const FIELDS_FOR: Record<AskField, (keyof LlmTag)[]> = {
  roleCategory: ['roleCategory'],
  cities: ['cities'],
  workMode: ['workMode'],
  jobType: ['jobType'],
  isFresher: ['isFresher'],
  experience: [],
  stipend: [],
  skills: [],
};

export type Validation = { ok: true; tag: LlmTag } | { ok: false; error: string };

/**
 * Checks the LLM output beyond the JSON schema: asked fields present, cities in the gazetteer (aliases are
 * normalised, unknown names are an error), money and experience sane. Returns the normalised tag.
 * The error text is fed back to the model by the repair node, so it says exactly what to fix.
 */
export function validateLlmTag(tag: LlmTag, ask: AskField[]): Validation {
  const errors: string[] = [];
  for (const a of ask) {
    for (const f of FIELDS_FOR[a]) if (tag[f] === null) errors.push(`"${f}" was requested but is null`);
  }

  let cities = tag.cities;
  if (cities) {
    const mapped: string[] = [];
    for (const c of cities) {
      const canon = canonicalCity(c);
      if (!canon) errors.push(`city "${c}" is not in the known Indian city list; use a canonical city name or "Remote"`);
      else if (!mapped.includes(canon)) mapped.push(canon);
    }
    if (mapped.includes(REMOTE) && mapped.length > 1) errors.push('"Remote" must not be combined with other cities');
    cities = mapped;
  }

  const money = [tag.stipendMinMonthlyInr, tag.stipendMaxMonthlyInr];
  if (money.some((m) => m !== null && (!Number.isFinite(m) || m < 0))) errors.push('stipend values must be non-negative numbers (INR per month)');
  if (tag.stipendMinMonthlyInr !== null && tag.stipendMaxMonthlyInr !== null && tag.stipendMinMonthlyInr > tag.stipendMaxMonthlyInr)
    errors.push('stipendMinMonthlyInr is greater than stipendMaxMonthlyInr');
  if (ask.includes('stipend') && money.some((m) => m !== null && m > 0 && m < 500))
    errors.push('stipend looks like it is not monthly rupees (value under 500); convert to INR per month');

  const exp = [tag.experienceMinYears, tag.experienceMaxYears];
  if (exp.some((y) => y !== null && (y < 0 || y > 50))) errors.push('experience years must be between 0 and 50');
  if (tag.experienceMinYears !== null && tag.experienceMaxYears !== null && tag.experienceMinYears > tag.experienceMaxYears)
    errors.push('experienceMinYears is greater than experienceMaxYears');
  if (!Number.isFinite(tag.confidence) || tag.confidence < 0 || tag.confidence > 1) errors.push('confidence must be between 0 and 1');

  if (errors.length) return { ok: false, error: errors.join('; ') };
  return { ok: true, tag: { ...tag, cities, skills: tag.skills ? tag.skills.slice(0, 8) : tag.skills } };
}

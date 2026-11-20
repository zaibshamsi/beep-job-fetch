/**
 * Pure decision logic of the enrichment graph (PRD section 8): what is already settled, what to ask the LLM,
 * and how rules, Jev and LLM answers are merged with provenance. No I/O, so it is easy to test.
 */
import { REMOTE } from '@beep/shared';
import type { Enrichment, FieldProvenance, JobPost, JobType, RoleCategory, TaggedBy, WorkMode } from '@beep/shared';
import type { FresherVerdict, RuleTagResult } from '../contracts.ts';
import type { JevClassification } from '../providers/jev.ts';
import type { AskField, LlmTag } from '../providers/llm-prompts.v1.ts';

export const CONFIDENT = 0.7;
/** Confidence credited to a field matched by strong rules. */
export const RULE_CONFIDENCE = 0.9;
/** A keyword role match must be at least this sure to beat the models. */
const STRONG_ROLE = 0.8;
/** Confidence of "nothing said, so the usual default" for job type and work mode. */
const DEFAULT_CONFIDENCE = 0.7;

export interface Cand<T> {
  value: T;
  confidence: number;
  by: TaggedBy;
}
export interface Categorical {
  roleCategory?: Cand<RoleCategory>;
  jobType?: Cand<JobType>;
  workMode?: Cand<WorkMode>;
  isFresher?: Cand<boolean>;
}

export interface DecideInput {
  post: JobPost;
  rules: RuleTagResult;
  fresher: FresherVerdict;
  jev: JevClassification | null;
}

const GENERIC_PLACE = /\b(india|pan[\s-]?india|remote|anywhere|work from home|wfh|hybrid|on[\s-]?site|onsite)\b/gi;

/** True when the location text names something that looks like a place (so a missing city is a real gap). */
export function namesPlace(post: JobPost): boolean {
  return /\p{L}/u.test(post.locationRaw.replace(GENERIC_PLACE, ''));
}

const STIPEND_TEXT = /stipend|₹|\binr\b|\brs\.?\s*\d|\d\s*(?:k\b|lpa|lakhs?|\/\s*month|per month)/i;

/** True when pay is stated in the post, so a missing stipend value is a real gap. */
export function hasPayText(post: JobPost): boolean {
  if (post.compensationRaw && /\d/.test(post.compensationRaw)) return true;
  return STIPEND_TEXT.test(post.description.slice(0, 3000));
}

const cand = <T>(value: T, confidence: number, by: TaggedBy): Cand<T> => ({ value, confidence, by });

/** Splits each categorical field into a confident answer (rules, source or Jev >= 0.7) and a weak fallback. */
export function settle(i: DecideInput): { settled: Categorical; weak: Categorical } {
  const { rules, jev, post } = i;
  const settled: Categorical = {};
  const weak: Categorical = {};

  if (rules.roleHint && rules.roleConfidence >= STRONG_ROLE) settled.roleCategory = cand(rules.roleHint, RULE_CONFIDENCE, 'rules');
  else if (jev?.role && jev.role.confidence >= CONFIDENT) settled.roleCategory = cand(jev.role.value, jev.role.confidence, 'jev');
  if (jev?.role) weak.roleCategory = cand(jev.role.value, jev.role.confidence, 'jev');
  else if (rules.roleHint) weak.roleCategory = cand(rules.roleHint, rules.roleConfidence, 'rules');

  if (rules.jobTypeHint) settled.jobType = cand(rules.jobTypeHint, RULE_CONFIDENCE, 'rules');
  else if (post.sourceHint === 'internship') settled.jobType = cand<JobType>('internship', RULE_CONFIDENCE, 'source');
  else if (jev?.jobType && jev.jobType.confidence >= CONFIDENT) settled.jobType = cand(jev.jobType.value, jev.jobType.confidence, 'jev');
  if (jev?.jobType) weak.jobType = cand(jev.jobType.value, jev.jobType.confidence, 'jev');

  if (rules.workModeHint) settled.workMode = cand(rules.workModeHint, RULE_CONFIDENCE, 'rules');
  else if (jev?.workMode && jev.workMode.confidence >= CONFIDENT) settled.workMode = cand(jev.workMode.value, jev.workMode.confidence, 'jev');
  if (jev?.workMode) weak.workMode = cand(jev.workMode.value, jev.workMode.confidence, 'jev');

  if (i.fresher !== 'unknown') settled.isFresher = cand(i.fresher === 'yes', RULE_CONFIDENCE, 'rules');
  else if (post.sourceHint !== 'none') settled.isFresher = cand(true, RULE_CONFIDENCE, 'source');
  else if (jev?.isFresher && jev.isFresher.confidence >= CONFIDENT) settled.isFresher = cand(jev.isFresher.value, jev.isFresher.confidence, 'jev');
  if (jev?.isFresher) weak.isFresher = cand(jev.isFresher.value, jev.isFresher.confidence, 'jev');

  return { settled, weak };
}

/** Fields the LLM must fill: unsettled categorical fields plus free values the rules missed. Empty = skip the LLM. */
export function fieldsToAsk(i: DecideInput): AskField[] {
  const { settled } = settle(i);
  const ask: AskField[] = [];
  if (!settled.roleCategory) ask.push('roleCategory');
  if (!settled.jobType) ask.push('jobType');
  if (!settled.workMode) ask.push('workMode');
  if (!settled.isFresher) ask.push('isFresher');
  if (i.rules.cities.length === 0 && namesPlace(i.post)) ask.push('cities');
  if (i.rules.stipendMinMonthlyInr === null && hasPayText(i.post)) ask.push('stipend');
  if (ask.length === 0) return ask;
  // The LLM is being called anyway: let it fill what the rules left empty at no extra request.
  if (i.rules.experienceMinYears === null && i.rules.experienceMaxYears === null) ask.push('experience');
  if (i.rules.skills.length === 0) ask.push('skills');
  return ask;
}

/** Human-readable hints for the LLM prompt: low-confidence Jev guesses to confirm or correct. */
export function buildHints(i: DecideInput, ask: AskField[]): string[] {
  const { jev } = i;
  if (!jev) return [];
  const pct = (c: number) => Math.round(c * 100);
  const hints: string[] = [];
  if (ask.includes('roleCategory') && jev.role) hints.push(`a fast classifier guessed role "${jev.role.value}" (${pct(jev.role.confidence)}% sure)`);
  if (ask.includes('jobType') && jev.jobType) hints.push(`classifier guessed jobType "${jev.jobType.value}" (${pct(jev.jobType.confidence)}% sure)`);
  if (ask.includes('workMode') && jev.workMode) hints.push(`classifier guessed workMode "${jev.workMode.value}" (${pct(jev.workMode.confidence)}% sure)`);
  if (ask.includes('isFresher') && jev.isFresher) hints.push(`classifier guessed isFresher=${jev.isFresher.value} (${pct(jev.isFresher.confidence)}% sure)`);
  return hints;
}

/** What is already decided, for the "Already decided" line of the LLM prompt. */
export function decidedForPrompt(i: DecideInput): Record<string, unknown> {
  const { settled } = settle(i);
  const out: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(settled)) out[k] = (c as Cand<unknown>).value;
  if (i.rules.cities.length) out.cities = i.rules.cities;
  if (i.rules.stipendMinMonthlyInr !== null) out.stipendMinMonthlyInr = i.rules.stipendMinMonthlyInr;
  if (i.rules.stipendMaxMonthlyInr !== null) out.stipendMaxMonthlyInr = i.rules.stipendMaxMonthlyInr;
  return out;
}

export interface MergeInput extends DecideInput {
  /** Validated LLM output (only the asked fields are non-null) and its overall confidence. */
  llm: { tag: Partial<LlmTag>; confidence: number } | null;
}

export interface Merged {
  enrichment: Enrichment;
  provenance: FieldProvenance;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Combines rules, Jev and LLM for every field and records who decided what. */
export function mergeFields(i: MergeInput): Merged {
  const { rules, post, llm } = i;
  const { settled, weak } = settle(i);
  const prov: FieldProvenance = {};
  const confs: number[] = [];
  const llmConf = llm ? clamp01(llm.confidence) : 0;

  function pickCat<K extends keyof Categorical, V>(field: K, fromLlm: V | null | undefined, fallback: V, fallbackConf: number, fallbackBy: TaggedBy): V {
    const s = settled[field] as Cand<V> | undefined;
    const w = weak[field] as Cand<V> | undefined;
    let c: Cand<V>;
    if (s) c = s;
    else if (fromLlm !== null && fromLlm !== undefined) c = cand(fromLlm, llmConf, 'llm');
    else if (w) c = w;
    else c = cand(fallback, fallbackConf, fallbackBy);
    prov[field] = c.by;
    confs.push(c.confidence);
    return c.value;
  }

  const roleCategory = pickCat('roleCategory', llm?.tag.roleCategory, 'Other' as RoleCategory, 0.3, 'rules');
  const jobType = pickCat('jobType', llm?.tag.jobType, 'full_time' as JobType, DEFAULT_CONFIDENCE, 'rules');
  const workMode = pickCat('workMode', llm?.tag.workMode, 'onsite' as WorkMode, DEFAULT_CONFIDENCE, 'rules');
  // No evidence either way = not shown as a fresher post. Precision beats recall: a "Team Leader" role
  // listed as a fresher job is worse than a missing one. Flagged for review via the 0.5 confidence.
  const isFresher = pickCat('isFresher', llm?.tag.isFresher, false, 0.5, 'rules');

  // cities: rules > LLM > Remote (when remote) > none. Jev's primary-city pick only reorders (done by the caller).
  let cities: string[];
  if (rules.cities.length) {
    cities = rules.cities;
    prov.cities = 'rules';
    confs.push(RULE_CONFIDENCE);
  } else if (llm?.tag.cities && llm.tag.cities.length) {
    cities = llm.tag.cities;
    prov.cities = 'llm';
    confs.push(llmConf);
  } else if (workMode === 'remote') {
    cities = [REMOTE];
    prov.cities = settled.workMode?.by ?? 'rules';
    confs.push(Math.min(RULE_CONFIDENCE, settled.workMode?.confidence ?? weak.workMode?.confidence ?? llmConf));
  } else {
    cities = [];
    prov.cities = 'rules';
    confs.push(namesPlace(post) ? 0.3 : 0.4); // a post with no city and not remote always needs a human look
  }

  // stipend: rules > LLM; confidence only counts when the post actually states pay
  let stipendMin = rules.stipendMinMonthlyInr;
  let stipendMax = rules.stipendMaxMonthlyInr;
  if (stipendMin !== null || stipendMax !== null) {
    prov.stipendMinMonthlyInr = prov.stipendMaxMonthlyInr = 'rules';
    confs.push(RULE_CONFIDENCE);
  } else if (llm && (llm.tag.stipendMinMonthlyInr != null || llm.tag.stipendMaxMonthlyInr != null)) {
    stipendMin = llm.tag.stipendMinMonthlyInr ?? llm.tag.stipendMaxMonthlyInr ?? null;
    stipendMax = llm.tag.stipendMaxMonthlyInr ?? llm.tag.stipendMinMonthlyInr ?? null;
    prov.stipendMinMonthlyInr = prov.stipendMaxMonthlyInr = 'llm';
    confs.push(llmConf);
  } else if (hasPayText(post)) {
    confs.push(llm ? llmConf : 0.5);
  }

  let expMin = rules.experienceMinYears;
  let expMax = rules.experienceMaxYears;
  if (expMin !== null || expMax !== null) prov.experienceMinYears = prov.experienceMaxYears = 'rules';
  else if (llm && (llm.tag.experienceMinYears != null || llm.tag.experienceMaxYears != null)) {
    expMin = llm.tag.experienceMinYears ?? null;
    expMax = llm.tag.experienceMaxYears ?? null;
    prov.experienceMinYears = prov.experienceMaxYears = 'llm';
  }

  let skills = rules.skills;
  if (skills.length) prov.skills = 'rules';
  else if (llm?.tag.skills?.length) {
    skills = llm.tag.skills;
    prov.skills = 'llm';
  }

  return {
    enrichment: {
      roleCategory,
      cities,
      workMode,
      jobType,
      isFresher,
      experienceMinYears: expMin,
      experienceMaxYears: expMax,
      stipendMinMonthlyInr: stipendMin,
      stipendMaxMonthlyInr: stipendMax,
      skills: skills.slice(0, 8),
      confidence: round2(Math.min(...confs)),
    },
    provenance: prov,
  };
}

/** Moves Jev's primary-city pick to the front when rules found several cities. */
export function orderCitiesByJev(cities: string[], jev: JevClassification | null): string[] {
  const primary = jev?.city?.value;
  if (!primary || !cities.includes(primary)) return cities;
  return [primary, ...cities.filter((c) => c !== primary)];
}

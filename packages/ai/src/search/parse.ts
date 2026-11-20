/**
 * Natural-language search parsing, in layers (PRD section 10):
 *  (a) rule parser (always)  (b) LLM for the full filter object, or Jev Choice for role/job type when only Jev is set
 *  (c) cache by hash of the normalised query.
 * Never throws: any provider failure falls back to the rule result.
 */
import { JobFiltersSchema, REMOTE, createLogger } from '@beep/shared';
import type { JobFilters } from '@beep/shared';
import type { ParsedSearch } from '../contracts.ts';
import { jevRequest } from '../providers/jev.ts';
import { JEV_PROMPT_VERSION, buildJevQuestions, roleFromSlug } from '../providers/jev-questions.v1.ts';
import { llmStructured } from '../providers/llm.ts';
import { LLM_PROMPT_VERSION, LlmSearchSchema, SEARCH_SYSTEM_PROMPT, buildSearchUserMessage } from '../providers/llm-prompts.v1.ts';
import type { LlmSearch } from '../providers/llm-prompts.v1.ts';
import { errorText } from '../providers/log.ts';
import { canonicalCity } from '../enrich/validate.ts';
import { getJevConfig, getLlmConfig } from '../settings/config.ts';
import { RANK, readCache, writeCache } from './cache.ts';
import type { ParsedBy } from './cache.ts';
import { buildChips, focusCityOf } from './chips.ts';
import { normaliseQuery, parseWithRules } from './rules.ts';

const log = createLogger('ai:search');

/** Jev's Choice always picks something, so only a clear answer may become a filter. */
const JEV_SEARCH_MIN_CONFIDENCE = 0.8;

/** Drops empty values so the filter object only carries what is applied. */
function compact(f: JobFilters): JobFilters {
  const out: JobFilters = {};
  if (f.keywords?.length) out.keywords = f.keywords;
  if (f.cities?.length) out.cities = f.cities;
  if (f.roleCategory) out.roleCategory = f.roleCategory;
  if (f.jobType) out.jobType = f.jobType;
  if (f.workMode) out.workMode = f.workMode;
  if (f.stipendMin != null) out.stipendMin = f.stipendMin;
  if (f.postedWithinDays != null) out.postedWithinDays = f.postedWithinDays;
  return out;
}

/** LLM output + rule results. Rules win on cities; for other fields the LLM answer is used unless it is empty. */
function mergeLlm(rules: JobFilters, llm: LlmSearch): JobFilters {
  const llmCities = llm.cities.map((c) => canonicalCity(c)).filter((c): c is string => c !== null && c !== REMOTE);
  const wantsRemote = llm.cities.some((c) => c.toLowerCase() === 'remote');
  const keywords = [...new Set(llm.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 8);
  return compact({
    keywords: keywords.length ? keywords : rules.keywords,
    cities: rules.cities?.length ? rules.cities : [...new Set(llmCities)],
    roleCategory: llm.roleCategory ?? rules.roleCategory,
    jobType: llm.jobType ?? rules.jobType,
    workMode: llm.workMode ?? rules.workMode ?? (wantsRemote ? 'remote' : null),
    stipendMin: llm.stipendMin ?? rules.stipendMin,
    postedWithinDays: llm.postedWithinDays ?? rules.postedWithinDays,
  });
}

async function viaLlm(query: string, rules: JobFilters): Promise<JobFilters | null> {
  const cfg = await getLlmConfig();
  if (!cfg) return null;
  try {
    const r = await llmStructured(
      cfg,
      {
        schema: LlmSearchSchema,
        schemaName: 'search_filters',
        messages: [
          { role: 'system', content: SEARCH_SYSTEM_PROMPT },
          { role: 'user', content: buildSearchUserMessage(query) },
        ],
        maxOutputTokens: 400,
      },
      { purpose: 'search_parse', promptVersion: LLM_PROMPT_VERSION },
    );
    if (!r.parsed) {
      log.warn(`LLM search parse rejected: ${r.parseError}`);
      return null;
    }
    const merged = JobFiltersSchema.safeParse(mergeLlm(rules, r.parsed));
    return merged.success ? compact(merged.data) : null;
  } catch (e) {
    log.warn(`LLM search parse failed, using rules: ${errorText(e)}`);
    return null;
  }
}

/** Jev fills role and job type only where the rules left them empty and there is something left to classify. */
async function viaJev(query: string, rules: JobFilters): Promise<JobFilters | null> {
  const needRole = !rules.roleCategory;
  const needType = !rules.jobType;
  if (!rules.keywords?.length || (!needRole && !needType)) return null;
  const cfg = await getJevConfig();
  if (!cfg) return null;
  try {
    const all = buildJevQuestions();
    const questions = { ...(needRole ? { role: all.role } : {}), ...(needType ? { jobType: all.jobType } : {}) };
    const res = await jevRequest(cfg, `Job search query: ${query.slice(0, 300)}`, questions, {
      purpose: 'search_parse',
      promptVersion: JEV_PROMPT_VERSION,
    });
    const out: JobFilters = { ...rules };
    const role = res.answers.role;
    if (needRole && role?.type === 'choice' && role.choice && (role.confidence ?? 0) >= JEV_SEARCH_MIN_CONFIDENCE) {
      out.roleCategory = roleFromSlug(role.choice) ?? undefined;
    }
    const type = res.answers.jobType;
    if (needType && type?.type === 'choice' && type.choice && (type.confidence ?? 0) >= JEV_SEARCH_MIN_CONFIDENCE) {
      const parsed = JobFiltersSchema.shape.jobType.safeParse(type.choice);
      if (parsed.success && parsed.data) out.jobType = parsed.data;
    }
    return compact(out);
  } catch (e) {
    log.warn(`Jev search parse failed, using rules: ${errorText(e)}`);
    return null;
  }
}

function result(filters: JobFilters, parsedBy: ParsedSearch['parsedBy']): ParsedSearch {
  return { filters, chips: buildChips(filters), parsedBy, focusCity: focusCityOf(filters) };
}

export async function parseSearchQuery(query: string): Promise<ParsedSearch> {
  if (!normaliseQuery(query)) return result({}, 'rules');

  const [llmCfg, jevCfg] = await Promise.all([getLlmConfig(), getJevConfig()]);
  const available: ParsedBy = llmCfg ? 'llm' : jevCfg ? 'jev' : 'rules';

  const cached = await readCache(query);
  if (cached && RANK[cached.parsedBy] >= RANK[available]) return result(cached.filters, 'cache');

  const rules = compact(parseWithRules(query).filters);
  let filters = rules;
  let parsedBy: ParsedBy = 'rules';

  if (llmCfg) {
    const f = await viaLlm(query, rules);
    if (f) [filters, parsedBy] = [f, 'llm'];
  } else if (jevCfg) {
    const f = await viaJev(query, rules);
    if (f) [filters, parsedBy] = [f, 'jev'];
  }

  // A rules-only answer produced while a model is configured means that model failed; do not pin it in the cache.
  if (parsedBy === available || available === 'rules') await writeCache(query, filters, parsedBy);
  return result(filters, parsedBy);
}

/**
 * LangGraph enrichment graph (PRD section 8):
 *
 *   ruleTagger -> jevClassifier -> confidenceGate -+-> merge -> save
 *                                                  +-> llmTagger -> validate -+-> merge -> save
 *                                                         ^                   |
 *                                                         +----- repair <-----+ (invalid, at most 2 retries)
 *
 * `save` finalises the EnrichResult; writing it to the jobs table is the pipeline's job (it owns the transaction).
 * Provider errors never throw out of the graph: the node records the error and the run continues with the best
 * result so far, flagged needsReview.
 */
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { EnrichmentSchema, createLogger } from '@beep/shared';
import type { Enrichment, FieldProvenance, JobPost } from '@beep/shared';
import type { EnrichOptions, EnrichResult, FresherVerdict, RuleTagResult } from '../contracts.ts';
import { jevClassify } from '../providers/jev.ts';
import type { JevClassification } from '../providers/jev.ts';
import { llmStructured } from '../providers/llm.ts';
import type { LlmMessage } from '../providers/llm.ts';
import { errorText } from '../providers/log.ts';
import { JEV_PROMPT_VERSION } from '../providers/jev-questions.v1.ts';
import {
  LLM_PROMPT_VERSION,
  LlmTagSchema,
  TAG_SYSTEM_PROMPT,
  buildRepairMessage,
  buildTagUserMessage,
} from '../providers/llm-prompts.v1.ts';
import type { AskField, LlmTag } from '../providers/llm-prompts.v1.ts';
import { fresherCheck, ruleTag } from '../rules/index.ts';
import { getJevConfig, getLlmConfig } from '../settings/config.ts';
import { CONFIDENT, buildHints, decidedForPrompt, fieldsToAsk, mergeFields, orderCitiesByJev } from './decide.ts';
import type { DecideInput } from './decide.ts';
import { validateLlmTag } from './validate.ts';

const log = createLogger('ai:enrich');

/** First attempt plus 2 repair retries. */
const MAX_LLM_ATTEMPTS = 3;

const last = <T>(init: T) => Annotation<T>({ reducer: (_a, b) => b, default: () => init });

const State = Annotation.Root({
  post: Annotation<JobPost>(),
  opts: Annotation<EnrichOptions>(),
  rules: Annotation<RuleTagResult | null>({ reducer: (_a, b) => b, default: () => null }),
  fresher: last<FresherVerdict>('unknown'),
  jev: last<JevClassification | null>(null),
  jevCalled: last(false),
  llmCalled: last(false),
  ask: last<AskField[]>([]),
  attempts: last(0),
  lastRaw: last(''),
  /** Error to feed back to the model on the next llmTagger pass. */
  repairNote: last<string | null>(null),
  validationError: last<string | null>(null),
  llmTag: last<{ tag: LlmTag; confidence: number } | null>(null),
  repairFailed: last(false),
  providerFailed: last(false),
  result: last<EnrichResult | null>(null),
});
type S = typeof State.State;

const decideInput = (s: S): DecideInput => ({ post: s.post, rules: s.rules!, fresher: s.fresher, jev: s.jev });

async function ruleTagger(s: S): Promise<Partial<S>> {
  const rules = ruleTag(s.post);
  const fresher = rules.fresher !== 'unknown' ? rules.fresher : fresherCheck(s.post).verdict;
  return { rules, fresher };
}

async function jevClassifier(s: S): Promise<Partial<S>> {
  if (!(await getJevConfig())) return {};
  const rules = s.rules!;
  // With several candidate cities Jev picks the primary one; with 0 or 1 there is nothing to choose between.
  const candidateCities = rules.cities.length >= 2 ? rules.cities : [];
  try {
    const jev = await jevClassify(s.post, { candidateCities, runId: s.opts.runId, jobId: s.opts.jobId });
    return { jev, jevCalled: true, rules: { ...rules, cities: orderCitiesByJev(rules.cities, jev) } };
  } catch (e) {
    log.warn(`Jev failed, continuing without it: ${errorText(e)}`);
    return { jevCalled: true, providerFailed: true };
  }
}

async function confidenceGate(s: S): Promise<Partial<S>> {
  return { ask: fieldsToAsk(decideInput(s)) };
}

/** Routes to the LLM only when something is missing or low-confidence and an LLM key exists. */
async function afterGate(s: S): Promise<'llmTagger' | 'merge'> {
  if (s.ask.length === 0) return 'merge';
  return (await getLlmConfig()) ? 'llmTagger' : 'merge';
}

async function llmTagger(s: S): Promise<Partial<S>> {
  const cfg = await getLlmConfig();
  if (!cfg) return { providerFailed: true };
  const input = decideInput(s);
  const messages: LlmMessage[] = [
    { role: 'system', content: TAG_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildTagUserMessage({ post: s.post, ask: s.ask, decided: decidedForPrompt(input), hints: buildHints(input, s.ask) }),
    },
  ];
  if (s.repairNote) {
    messages.push({ role: 'assistant', content: s.lastRaw }, { role: 'user', content: buildRepairMessage(s.repairNote) });
  }
  try {
    const r = await llmStructured(cfg, { schema: LlmTagSchema, schemaName: 'job_tags', messages }, {
      purpose: 'tag_llm',
      runId: s.opts.runId,
      jobId: s.opts.jobId,
      promptVersion: LLM_PROMPT_VERSION,
    });
    return {
      llmCalled: true,
      attempts: s.attempts + 1,
      lastRaw: r.raw,
      repairNote: null,
      validationError: r.parseError,
      llmTag: r.parsed ? { tag: r.parsed, confidence: r.parsed.confidence } : null,
    };
  } catch (e) {
    log.warn(`LLM failed, keeping rules/Jev result: ${errorText(e)}`);
    return { llmCalled: true, providerFailed: true, attempts: MAX_LLM_ATTEMPTS, llmTag: null, validationError: null };
  }
}

async function validate(s: S): Promise<Partial<S>> {
  if (s.validationError || !s.llmTag) return { llmTag: null };
  const v = validateLlmTag(s.llmTag.tag, s.ask);
  if (v.ok) return { llmTag: { tag: v.tag, confidence: s.llmTag.confidence }, validationError: null };
  return { llmTag: null, validationError: v.error };
}

function afterValidate(s: S): 'merge' | 'repair' {
  if (!s.validationError) return 'merge';
  return s.attempts < MAX_LLM_ATTEMPTS ? 'repair' : 'merge';
}

async function repair(s: S): Promise<Partial<S>> {
  log.debug(`repair attempt ${s.attempts}: ${s.validationError}`);
  return { repairNote: s.validationError };
}

async function merge(s: S): Promise<Partial<S>> {
  // A model answer that never validated is discarded; the previous best (rules + Jev) is used instead.
  const repairFailed = s.validationError !== null;
  const merged = mergeFields({ ...decideInput(s), llm: s.llmTag });
  const parsed = EnrichmentSchema.safeParse(merged.enrichment);
  const enrichment: Enrichment = parsed.success ? parsed.data : merged.enrichment;
  const needsReview = !parsed.success || enrichment.confidence < CONFIDENT || repairFailed || s.providerFailed;
  const used = { jev: s.jevCalled, llm: s.llmCalled };
  const promptVersion = [s.jev || s.jevCalled ? JEV_PROMPT_VERSION : null, s.llmCalled ? LLM_PROMPT_VERSION : null].filter(Boolean).join('+') || 'rules';
  return {
    repairFailed,
    result: { enrichment, provenance: merged.provenance as FieldProvenance, needsReview, promptVersion, used },
  };
}

async function save(s: S): Promise<Partial<S>> {
  // Persisting is the pipeline's job; this node is the graph's single exit with a complete result.
  return { result: s.result };
}

const compiled = new StateGraph(State)
  .addNode('ruleTagger', ruleTagger)
  .addNode('jevClassifier', jevClassifier)
  .addNode('confidenceGate', confidenceGate)
  .addNode('llmTagger', llmTagger)
  .addNode('validate', validate)
  .addNode('repair', repair)
  .addNode('merge', merge)
  .addNode('save', save)
  .addEdge(START, 'ruleTagger')
  .addEdge('ruleTagger', 'jevClassifier')
  .addEdge('jevClassifier', 'confidenceGate')
  .addConditionalEdges('confidenceGate', afterGate, ['llmTagger', 'merge'])
  .addEdge('llmTagger', 'validate')
  .addConditionalEdges('validate', afterValidate, ['merge', 'repair'])
  .addEdge('repair', 'llmTagger')
  .addEdge('merge', 'save')
  .addEdge('save', END)
  .compile();

export async function runEnrichGraph(post: JobPost, opts: EnrichOptions = {}): Promise<EnrichResult> {
  const out = await compiled.invoke({ post, opts });
  if (!out.result) throw new Error('enrichment graph finished without a result');
  return out.result;
}

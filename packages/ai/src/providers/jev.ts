import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { Questions } from '@typesafe-ai/sdk';
import type { JobPost, JobType, RoleCategory, WorkMode } from '@beep/shared';
import { JOB_TYPES, WORK_MODES } from '@beep/shared';
import { getJevConfig } from '../settings/config.ts';
import type { JevConfig } from '../settings/config.ts';
import { JEV_PROMPT_VERSION, buildJevQuestions, buildJevState, roleFromSlug } from './jev-questions.v1.ts';
import { errorText, logLlmCall } from './log.ts';
import type { CallMeta } from './log.ts';

export interface JevAnswer<T> {
  value: T;
  /** 0..1. For Choice: Jev's reported confidence. For Noul: max(p, 1-p). */
  confidence: number;
}

export interface JevClassification {
  role: JevAnswer<RoleCategory> | null;
  jobType: JevAnswer<JobType> | null;
  workMode: JevAnswer<WorkMode> | null;
  /** probability = P(fresher); confidence = how far from 0.5 it is. */
  isFresher: (JevAnswer<boolean> & { probability: number }) | null;
  /** Only present when candidate cities were supplied. */
  city: JevAnswer<string> | null;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

/** What the SDK returns, loosened: our question set is built dynamically so keys are not statically known. */
interface RawAnswers {
  [k: string]: { type: string; choice?: string; confidence?: number; noul?: number } | undefined;
}

/**
 * Jev can be reached two ways with the same question/answer shapes:
 *  - TypeSafe directly (api.typesafe.ai, official SDK), key from console.typesafe.ai, model "jev-latest";
 *  - through OpenRouter (POST https://openrouter.ai/api/alpha/decisions), key "sk-or-...", model "typesafe/jev-1.14".
 * The transport is chosen from the key, so the owner only has to paste the key.
 */
export type JevTransport = 'typesafe' | 'openrouter';
export const jevTransportFor = (apiKey: string): JevTransport => (apiKey.startsWith('sk-or-') ? 'openrouter' : 'typesafe');
export const OPENROUTER_JEV_MODEL = 'typesafe/jev-1.14';
const OPENROUTER_URL = 'https://openrouter.ai/api/alpha/decisions';

interface JevWireResponse {
  model?: string;
  answers: Record<string, unknown>;
  usage: { input_tokens?: number; output_tokens?: number; cost?: number };
}

async function openRouterDecisions(apiKey: string, model: string, state: string, questions: Questions): Promise<JevWireResponse> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, state, questions }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 400);
    try {
      const j = JSON.parse(text) as { error?: { message?: string } | string };
      message = typeof j.error === 'string' ? j.error : (j.error?.message ?? message);
    } catch {
      /* not JSON: keep the raw text */
    }
    throw new Error(`${res.status} ${message}`);
  }
  return JSON.parse(text) as JevWireResponse;
}

const clients = new Map<string, TypeSafeClient>();
function clientFor(cfg: JevConfig): TypeSafeClient {
  const id = `${cfg.apiKey}|${cfg.model}`;
  let c = clients.get(id);
  if (!c) {
    c = new TypeSafeClient({ apiKey: cfg.apiKey, defaultModel: cfg.model, timeout: 20_000, logLevel: 'off' });
    clients.set(id, c);
  }
  return c;
}

/** Low-level request with an explicit config (used by testProvider with unsaved credentials). Logs one llm_calls row. */
export async function jevRequest(
  cfg: JevConfig,
  state: string,
  questions: Questions,
  meta: CallMeta,
): Promise<{ answers: RawAnswers; model: string; usage: { inputTokens: number; outputTokens: number }; latencyMs: number }> {
  const started = Date.now();
  const viaOpenRouter = jevTransportFor(cfg.apiKey) === 'openrouter';
  // OpenRouter only knows the namespaced model id; accept the plain default from settings too.
  const model = viaOpenRouter && !cfg.model.includes('/') ? OPENROUTER_JEV_MODEL : cfg.model;
  try {
    const res: JevWireResponse = viaOpenRouter
      ? await openRouterDecisions(cfg.apiKey, model, state, questions)
      : ((await clientFor(cfg).systemOne({ state, questions, model })) as unknown as JevWireResponse);
    const usage = { inputTokens: res.usage?.input_tokens ?? 0, outputTokens: res.usage?.output_tokens ?? 0 };
    const latencyMs = Date.now() - started;
    await logLlmCall({
      ...meta,
      provider: 'jev',
      model,
      ...usage,
      costUsd: typeof res.usage?.cost === 'number' ? res.usage.cost : undefined,
      latencyMs,
      success: true,
    });
    return { answers: res.answers as unknown as RawAnswers, model: res.model ?? model, usage, latencyMs };
  } catch (e) {
    await logLlmCall({
      ...meta,
      provider: 'jev',
      model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      error: errorText(e),
    });
    throw e;
  }
}

function choiceOf<T extends string>(a: RawAnswers[string], allowed: readonly T[]): JevAnswer<T> | null {
  if (!a || a.type !== 'choice' || a.choice === undefined) return null;
  const value = allowed.find((x) => x === a.choice);
  return value ? { value, confidence: a.confidence ?? 0 } : null;
}

/** Turns the raw SDK answers into typed values. Exported for tests. */
export function mapJevAnswers(answers: RawAnswers, candidateCities: string[] = []): Omit<JevClassification, 'model' | 'usage' | 'latencyMs'> {
  const role = answers.role;
  const roleValue = role?.type === 'choice' && role.choice ? roleFromSlug(role.choice) : null;
  const fresher = answers.isFresher;
  const p = fresher?.type === 'noul' && typeof fresher.noul === 'number' ? fresher.noul : null;
  const city = answers.city;
  return {
    role: roleValue ? { value: roleValue, confidence: role?.confidence ?? 0 } : null,
    jobType: choiceOf(answers.jobType, JOB_TYPES),
    workMode: choiceOf(answers.workMode, WORK_MODES),
    isFresher: p === null ? null : { value: p >= 0.5, probability: p, confidence: Math.max(p, 1 - p) },
    city: city?.type === 'choice' && city.choice && candidateCities.includes(city.choice) ? { value: city.choice, confidence: city.confidence ?? 0 } : null,
  };
}

/** Classify one post with the configured Jev key. Throws when Jev is not configured or the call fails. */
export async function jevClassify(
  post: JobPost,
  opts: { candidateCities?: string[]; runId?: number; jobId?: number } = {},
): Promise<JevClassification> {
  const cfg = await getJevConfig();
  if (!cfg) throw new Error('Jev is not configured');
  const candidateCities = opts.candidateCities ?? [];
  const questions = buildJevQuestions({ candidateCities }) as Questions;
  const res = await jevRequest(cfg, buildJevState(post), questions, {
    purpose: 'tag_jev',
    runId: opts.runId,
    jobId: opts.jobId,
    promptVersion: JEV_PROMPT_VERSION,
  });
  return { ...mapJevAnswers(res.answers, candidateCities), model: res.model, usage: res.usage, latencyMs: res.latencyMs };
}

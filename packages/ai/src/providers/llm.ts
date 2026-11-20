/**
 * Azure AI Foundry (OpenAI-compatible) chat client.
 *
 * Client choice: the official `openai` package's AzureOpenAI, not LangChain's AzureChatOpenAI. We make plain
 * single-shot structured calls, so LangChain would only add a layer; with `openai` the token usage (including
 * cached prompt tokens) is read straight from the response, the exact provider error text is preserved for the
 * Settings "Test connection" button, and request params such as max_completion_tokens (required by reasoning
 * deployments) stay under our control. LangGraph is still used for the enrichment graph.
 */
import { AzureOpenAI } from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import type { z } from 'zod';
import type { LlmConfig } from '../settings/config.ts';
import { errorText, logLlmCall } from './log.ts';
import type { CallMeta } from './log.ts';

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export interface LlmStructuredResult<T> {
  /** null when the reply was not valid JSON or failed the schema; see parseError. */
  parsed: T | null;
  parseError: string | null;
  raw: string;
  usage: LlmUsage;
  latencyMs: number;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Accepts "https://x.openai.azure.com", "https://x.services.ai.azure.com/" or a pasted URL with /openai/... on it. */
export function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/openai(\/.*)?$/i, '').replace(/\/+$/, '');
}

const clients = new Map<string, AzureOpenAI>();
function clientFor(cfg: LlmConfig): AzureOpenAI {
  const id = `${cfg.apiKey}|${cfg.endpoint}|${cfg.deployment}|${cfg.apiVersion}`;
  let c = clients.get(id);
  if (!c) {
    c = new AzureOpenAI({
      apiKey: cfg.apiKey,
      endpoint: normalizeEndpoint(cfg.endpoint),
      deployment: cfg.deployment,
      apiVersion: cfg.apiVersion,
      timeout: 60_000,
      maxRetries: 2,
    });
    clients.set(id, c);
  }
  return c;
}

interface CompletionLike {
  model?: string;
  choices: { message: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } | null } | null;
}

const usageOf = (r: CompletionLike): LlmUsage => ({
  inputTokens: r.usage?.prompt_tokens ?? 0,
  outputTokens: r.usage?.completion_tokens ?? 0,
  cachedTokens: r.usage?.prompt_tokens_details?.cached_tokens ?? 0,
});

/** Run a call, time it, and write the llm_calls row (success or failure). Rethrows provider errors untouched. */
async function logged<R extends CompletionLike>(
  cfg: LlmConfig,
  meta: CallMeta,
  fn: () => Promise<R>,
): Promise<{ res: R; usage: LlmUsage; latencyMs: number }> {
  const started = Date.now();
  try {
    const res = await fn();
    const latencyMs = Date.now() - started;
    const usage = usageOf(res);
    await logLlmCall({ ...meta, provider: 'azure_openai', model: cfg.model, ...usage, latencyMs, success: true });
    return { res, usage, latencyMs };
  } catch (e) {
    await logLlmCall({
      ...meta,
      provider: 'azure_openai',
      model: cfg.model,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Date.now() - started,
      success: false,
      error: errorText(e),
    });
    throw e;
  }
}

/** One structured-output call. Transport/auth errors throw; invalid model output comes back as parseError. */
export async function llmStructured<S extends z.ZodTypeAny>(
  cfg: LlmConfig,
  req: { schema: S; schemaName: string; messages: LlmMessage[]; maxOutputTokens?: number },
  meta: CallMeta,
): Promise<LlmStructuredResult<z.infer<S>>> {
  const format = zodResponseFormat(req.schema, req.schemaName);
  const { res, usage, latencyMs } = await logged(cfg, meta, () =>
    clientFor(cfg).chat.completions.create({
      model: cfg.deployment,
      messages: req.messages,
      response_format: { type: 'json_schema', json_schema: format.json_schema },
      // Not max_tokens (rejected by reasoning deployments) and no temperature (only the default is allowed there).
      max_completion_tokens: req.maxOutputTokens ?? 1500,
    }),
  );
  const choice = res.choices[0];
  const raw = choice?.message?.content ?? '';
  if (choice?.message?.refusal) return { parsed: null, parseError: `Model refused: ${choice.message.refusal}`, raw, usage, latencyMs };
  if (!raw) return { parsed: null, parseError: `Empty reply (finish_reason=${choice?.finish_reason ?? 'unknown'})`, raw, usage, latencyMs };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return { parsed: null, parseError: `Reply is not valid JSON: ${(e as Error).message}`, raw, usage, latencyMs };
  }
  const v = req.schema.safeParse(json);
  if (!v.success) {
    const msg = v.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    return { parsed: null, parseError: msg, raw, usage, latencyMs };
  }
  return { parsed: v.data, parseError: null, raw, usage, latencyMs };
}

/** Tiny real call for "Test connection". 16 tokens: some reasoning deployments reject smaller limits. */
export async function llmPing(cfg: LlmConfig, meta: CallMeta): Promise<{ model: string; latencyMs: number }> {
  const { res, latencyMs } = await logged(cfg, meta, () =>
    clientFor(cfg).chat.completions.create({
      model: cfg.deployment,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      max_completion_tokens: 16,
    }),
  );
  return { model: res.model ?? cfg.model, latencyMs };
}

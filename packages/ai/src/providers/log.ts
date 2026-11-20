import { costUsd, createLogger, exec } from '@beep/shared';

const log = createLogger('ai:llm-log');

export type LlmPurpose = 'tag_jev' | 'tag_llm' | 'search_parse' | 'test';
export type LlmProviderName = 'jev' | 'azure_openai';

/** Context passed to every provider call so it can be logged. */
export interface CallMeta {
  purpose: LlmPurpose;
  runId?: number;
  jobId?: number;
  promptVersion?: string;
}

export interface LlmCallLog extends CallMeta {
  provider: LlmProviderName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  latencyMs: number;
  success: boolean;
  error?: string | null;
  /** Provider-reported cost in USD (OpenRouter returns it); when absent the cost is computed from the price table. */
  costUsd?: number;
}

/** Writes one llm_calls row. Never throws (logging must not break tagging) and never receives keys or post bodies. */
export async function logLlmCall(c: LlmCallLog): Promise<void> {
  try {
    const cached = c.cachedTokens ?? 0;
    await exec(
      `INSERT INTO llm_calls (run_id, job_id, purpose, provider, model, input_tokens, output_tokens, cached_tokens,
                              cost_usd, latency_ms, prompt_version, success, error)
       VALUES (@runId, @jobId, @purpose, @provider, @model, @inputTokens, @outputTokens, @cachedTokens,
               @costUsd, @latencyMs, @promptVersion, @success, @error)`,
      {
        runId: c.runId ?? null,
        jobId: c.jobId ?? null,
        purpose: c.purpose,
        provider: c.provider,
        model: c.model,
        inputTokens: c.inputTokens,
        outputTokens: c.outputTokens,
        cachedTokens: cached,
        costUsd: c.costUsd ?? costUsd(c.model, c.inputTokens, c.outputTokens, cached),
        latencyMs: Math.round(c.latencyMs),
        promptVersion: c.promptVersion ?? null,
        success: c.success ? 1 : 0,
        error: c.error ? c.error.slice(0, 2000) : null,
      },
    );
  } catch (e) {
    log.warn(`could not write llm_calls row: ${(e as Error).message}`);
  }
}

/** Provider error text for logs and UI; falls back to String(). */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

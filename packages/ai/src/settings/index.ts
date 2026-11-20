import { noul } from '@typesafe-ai/sdk';
import type { AiModeName, AiStatus, Provider, ProviderInput, ProviderStatus, TestResult } from '../contracts.ts';
import { jevRequest } from '../providers/jev.ts';
import { llmPing } from '../providers/llm.ts';
import { errorText } from '../providers/log.ts';
import { getResolved, invalidateConfigCache } from './config.ts';
import type { Resolved } from './config.ts';
import { maskKey } from './crypto.ts';
import { deleteSettings, SETTING_KEYS, writeSetting } from './store.ts';

export { getJevConfig, getLlmConfig } from './config.ts';

const MODE_LABELS: Record<AiModeName, string> = {
  full: 'Jev + LLM: full tagging',
  jev_only: 'Jev only: rules + Jev, low-confidence posts are flagged for review',
  llm_only: 'LLM only: rules + LLM for every field the rules cannot fill',
  rules_only: 'Rules only: AI tagging off, add a key in Settings',
};

export function computeMode(jevConfigured: boolean, llmConfigured: boolean): { mode: AiModeName; modeLabel: string } {
  const mode: AiModeName = jevConfigured && llmConfigured ? 'full' : jevConfigured ? 'jev_only' : llmConfigured ? 'llm_only' : 'rules_only';
  return { mode, modeLabel: MODE_LABELS[mode] };
}

function toStatus(provider: Provider, r: Resolved): ProviderStatus {
  const base: ProviderStatus = {
    provider,
    configured: r.configured,
    source: r.source,
    maskedKey: r.apiKey ? maskKey(r.apiKey) : null,
    model: r.model || null,
  };
  if (provider === 'llm') {
    base.endpoint = r.endpoint || null;
    base.deployment = r.deployment || null;
    base.apiVersion = r.apiVersion || null;
  }
  return base;
}

export async function getAiStatus(): Promise<AiStatus> {
  const [jev, llm] = await Promise.all([getResolved('jev'), getResolved('llm')]);
  return { jev: toStatus('jev', jev), llm: toStatus('llm', llm), ...computeMode(jev.configured, llm.configured) };
}

/** Saves the provided fields only; an empty or missing field keeps its stored value (so the UI can change the model without resending the key). */
export async function saveProviderSettings(provider: Provider, input: ProviderInput): Promise<void> {
  const keys = SETTING_KEYS[provider] as Record<string, string>;
  const allowed = provider === 'jev' ? ['apiKey', 'model'] : ['apiKey', 'endpoint', 'deployment', 'apiVersion', 'model'];
  for (const field of allowed) {
    const value = (input as Record<string, string | undefined>)[field]?.trim();
    if (value) await writeSetting(keys[field], value);
  }
  invalidateConfigCache();
}

/** Removes every saved value for the provider; the .env fallback (if any) applies afterwards. */
export async function removeProviderSettings(provider: Provider): Promise<void> {
  await deleteSettings(Object.values(SETTING_KEYS[provider]));
  invalidateConfigCache();
}

/** One tiny real call using the effective config with `overrides` on top. Saves nothing. Never throws. */
export async function testProvider(provider: Provider, overrides: ProviderInput = {}): Promise<TestResult> {
  const r = await getResolved(provider);
  const pick = (o: string | undefined, current: string) => (o?.trim() ? o.trim() : current);
  const apiKey = pick(overrides.apiKey, r.apiKey);
  const started = Date.now();
  const fail = (error: string): TestResult => ({ ok: false, latencyMs: Date.now() - started, error: apiKey ? error.split(apiKey).join('***') : error });

  try {
    if (provider === 'jev') {
      if (!apiKey) return fail('No Jev API key set');
      const model = pick(overrides.model, r.model);
      const res = await jevRequest(
        { apiKey, model },
        'Software Engineer Intern at a Bengaluru startup',
        { isJob: noul('Is this text a job title?') },
        { purpose: 'test' },
      );
      return { ok: true, latencyMs: res.latencyMs, model: res.model };
    }

    const cfg = {
      apiKey,
      endpoint: pick(overrides.endpoint, r.endpoint),
      deployment: pick(overrides.deployment, r.deployment),
      apiVersion: pick(overrides.apiVersion, r.apiVersion),
      model: '',
    };
    const missing = (['apiKey', 'endpoint', 'deployment'] as const).filter((k) => !cfg[k]);
    if (missing.length) return fail(`Missing: ${missing.join(', ')}`);
    cfg.model = pick(overrides.model, cfg.deployment);
    const res = await llmPing(cfg, { purpose: 'test' });
    return { ok: true, latencyMs: res.latencyMs, model: res.model };
  } catch (e) {
    return fail(errorText(e));
  }
}

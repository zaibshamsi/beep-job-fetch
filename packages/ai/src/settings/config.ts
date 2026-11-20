import { createLogger, env } from '@beep/shared';
import type { Provider } from '../contracts.ts';
import { readAllSettings, SETTING_KEYS } from './store.ts';

const log = createLogger('ai:settings');

export interface JevConfig {
  apiKey: string;
  model: string;
}
export interface LlmConfig {
  apiKey: string;
  endpoint: string;
  deployment: string;
  apiVersion: string;
  /** Display / pricing name. Defaults to the deployment name. */
  model: string;
}

/** Effective settings for one provider: DB value first, then .env. */
export interface Resolved {
  configured: boolean;
  source: 'db' | 'env' | 'none';
  apiKey: string;
  model: string;
  endpoint: string;
  deployment: string;
  apiVersion: string;
}

const CACHE_MS = 15_000;
let cache: { at: number; value: Record<Provider, Resolved> } | null = null;

export function invalidateConfigCache(): void {
  cache = null;
}

const pick = (db: string | undefined, fallback: string) => (db && db.trim() ? db.trim() : fallback);

/** Pure merge of DB settings over .env values. Exported for tests. */
export function resolveSettings(db: Record<string, string>): Record<Provider, Resolved> {
  const jevKey = pick(db[SETTING_KEYS.jev.apiKey], env.jev.apiKey);
  const jev: Resolved = {
    configured: jevKey !== '',
    source: db[SETTING_KEYS.jev.apiKey] ? 'db' : jevKey ? 'env' : 'none',
    apiKey: jevKey,
    model: pick(db[SETTING_KEYS.jev.model], env.jev.model),
    endpoint: '',
    deployment: '',
    apiVersion: '',
  };

  const k = SETTING_KEYS.llm;
  const llmKey = pick(db[k.apiKey], env.azure.apiKey);
  const endpoint = pick(db[k.endpoint], env.azure.endpoint);
  const deployment = pick(db[k.deployment], env.azure.deployment);
  const llm: Resolved = {
    configured: llmKey !== '' && endpoint !== '' && deployment !== '',
    source: db[k.apiKey] ? 'db' : llmKey ? 'env' : 'none',
    apiKey: llmKey,
    model: pick(db[k.model], deployment),
    endpoint,
    deployment,
    apiVersion: pick(db[k.apiVersion], env.azure.apiVersion),
  };
  return { jev, llm };
}

async function resolveAll(): Promise<Record<Provider, Resolved>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  let db: Record<string, string> = {};
  try {
    db = await readAllSettings();
  } catch (e) {
    // DB down: fall back to .env so tagging and search keep working
    log.warn(`app_settings unavailable, using .env only: ${(e as Error).message}`);
  }
  const value = resolveSettings(db);
  cache = { at: Date.now(), value };
  return value;
}

export async function getResolved(provider: Provider): Promise<Resolved> {
  return (await resolveAll())[provider];
}

export async function getJevConfig(): Promise<JevConfig | null> {
  const r = await getResolved('jev');
  return r.configured ? { apiKey: r.apiKey, model: r.model } : null;
}

export async function getLlmConfig(): Promise<LlmConfig | null> {
  const r = await getResolved('llm');
  return r.configured
    ? { apiKey: r.apiKey, endpoint: r.endpoint, deployment: r.deployment, apiVersion: r.apiVersion, model: r.model }
    : null;
}

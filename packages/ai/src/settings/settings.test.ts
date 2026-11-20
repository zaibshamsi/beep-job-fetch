import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory app_settings + mutable env, injected in place of the real DB and .env.
const h = vi.hoisted(() => {
  const rows = new Map<string, string>();
  const env = {
    jev: { apiKey: '', model: 'jev-latest' },
    azure: { endpoint: '', apiKey: '', deployment: '', apiVersion: '2025-04-01-preview' },
  };
  return { rows, env, jevRequest: vi.fn(), llmPing: vi.fn() };
});

vi.mock('@beep/shared', async (orig) => {
  const actual = await orig<typeof import('@beep/shared')>();
  return {
    ...actual,
    env: { ...actual.env, jev: h.env.jev, azure: h.env.azure },
    query: vi.fn(async () => [...h.rows.entries()].map(([key, value]) => ({ key, value }))),
    exec: vi.fn(async (sql: string, p: Record<string, string>) => {
      if (/^\s*MERGE/i.test(sql)) h.rows.set(p.key!, p.value!);
      else if (/^\s*DELETE/i.test(sql)) h.rows.delete(p.key!);
      return 1;
    }),
  };
});
vi.mock('../providers/jev.ts', () => ({ jevRequest: h.jevRequest }));
vi.mock('../providers/llm.ts', () => ({ llmPing: h.llmPing }));

process.env.APP_SECRET = 'test-secret';
const { getAiStatus, saveProviderSettings, removeProviderSettings, testProvider, computeMode } = await import('./index.ts');
const { getJevConfig, getLlmConfig, invalidateConfigCache } = await import('./config.ts');

beforeEach(() => {
  h.rows.clear();
  h.env.jev.apiKey = '';
  h.env.azure.apiKey = h.env.azure.endpoint = h.env.azure.deployment = '';
  h.jevRequest.mockReset();
  h.llmPing.mockReset();
  invalidateConfigCache();
});

describe('mode computation', () => {
  it.each([
    [true, true, 'full'],
    [true, false, 'jev_only'],
    [false, true, 'llm_only'],
    [false, false, 'rules_only'],
  ] as const)('jev=%s llm=%s -> %s', (jev, llm, mode) => {
    const r = computeMode(jev, llm);
    expect(r.mode).toBe(mode);
    expect(r.modeLabel.length).toBeGreaterThan(5);
  });
});

describe('settings precedence DB > env', () => {
  it('is rules_only with nothing configured', async () => {
    const s = await getAiStatus();
    expect(s.mode).toBe('rules_only');
    expect(s.jev).toMatchObject({ configured: false, source: 'none', maskedKey: null });
    expect(await getJevConfig()).toBeNull();
    expect(await getLlmConfig()).toBeNull();
  });

  it('uses .env when the DB is empty', async () => {
    h.env.jev.apiKey = 'env-jev-key-0001';
    const s = await getAiStatus();
    expect(s.jev).toMatchObject({ configured: true, source: 'env', maskedKey: 'env...0001', model: 'jev-latest' });
    expect(s.mode).toBe('jev_only');
  });

  it('DB value wins over .env and is stored encrypted', async () => {
    h.env.jev.apiKey = 'env-jev-key-0001';
    await saveProviderSettings('jev', { apiKey: 'db-jev-key-9999', model: 'jev-preview' });
    expect(h.rows.get('jev.apiKey')).toMatch(/^v1:/);
    expect(h.rows.get('jev.apiKey')).not.toContain('9999');
    const s = await getAiStatus();
    expect(s.jev).toMatchObject({ source: 'db', maskedKey: 'db-...9999', model: 'jev-preview' });
    expect(await getJevConfig()).toEqual({ apiKey: 'db-jev-key-9999', model: 'jev-preview' });
  });

  it('LLM needs key, endpoint and deployment; falls back per field to .env', async () => {
    h.env.azure.endpoint = 'https://res.openai.azure.com';
    h.env.azure.deployment = 'gpt-env';
    expect((await getAiStatus()).llm.configured).toBe(false);
    await saveProviderSettings('llm', { apiKey: 'azure-key-123456' });
    const s = await getAiStatus();
    expect(s.llm).toMatchObject({
      configured: true,
      source: 'db',
      maskedKey: 'azu...3456',
      endpoint: 'https://res.openai.azure.com',
      deployment: 'gpt-env',
      model: 'gpt-env',
    });
    expect(s.mode).toBe('llm_only');
  });

  it('save invalidates the 15 s cache and remove falls back to .env', async () => {
    h.env.jev.apiKey = 'env-key-aaaa1111';
    expect((await getAiStatus()).jev.source).toBe('env');
    await saveProviderSettings('jev', { apiKey: 'db-key-bbbb2222' });
    expect((await getAiStatus()).jev.source).toBe('db');
    await removeProviderSettings('jev');
    expect(h.rows.size).toBe(0);
    expect((await getAiStatus()).jev.source).toBe('env');
  });

  it('keeps the stored key when only the model is saved', async () => {
    await saveProviderSettings('jev', { apiKey: 'db-key-bbbb2222' });
    await saveProviderSettings('jev', { apiKey: '  ', model: 'jev-preview' });
    expect(await getJevConfig()).toEqual({ apiKey: 'db-key-bbbb2222', model: 'jev-preview' });
  });

  it('treats an undecryptable key as unset', async () => {
    h.rows.set('jev.apiKey', 'v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect((await getAiStatus()).jev.configured).toBe(false);
  });
});

describe('testProvider', () => {
  it('reports the exact Jev error and saves nothing', async () => {
    h.jevRequest.mockRejectedValue(new Error('401 Invalid API key'));
    const r = await testProvider('jev', { apiKey: 'bad-key-0000000' });
    expect(r).toMatchObject({ ok: false, error: '401 Invalid API key' });
    expect(h.rows.size).toBe(0);
    expect(h.jevRequest.mock.calls[0]![3]).toMatchObject({ purpose: 'test' });
  });

  it('tests unsaved overrides over the effective config', async () => {
    h.env.jev.apiKey = 'env-key-aaaa1111';
    h.jevRequest.mockResolvedValue({ model: 'jev-2026', latencyMs: 120, answers: {}, usage: { inputTokens: 5, outputTokens: 0 } });
    const r = await testProvider('jev', { apiKey: 'new-key-cccc3333' });
    expect(r).toEqual({ ok: true, latencyMs: 120, model: 'jev-2026' });
    expect(h.jevRequest.mock.calls[0]![0]).toEqual({ apiKey: 'new-key-cccc3333', model: 'jev-latest' });
    expect(h.rows.size).toBe(0);
  });

  it('LLM test passes endpoint/deployment and lists what is missing', async () => {
    const missing = await testProvider('llm', { apiKey: 'k-12345678' });
    expect(missing).toMatchObject({ ok: false, error: 'Missing: endpoint, deployment' });
    h.llmPing.mockResolvedValue({ model: 'gpt-x', latencyMs: 300 });
    const ok = await testProvider('llm', { apiKey: 'k-12345678', endpoint: 'https://e.openai.azure.com', deployment: 'dep' });
    expect(ok).toEqual({ ok: true, latencyMs: 300, model: 'gpt-x' });
    expect(h.llmPing.mock.calls[0]![0]).toMatchObject({ deployment: 'dep', apiVersion: '2025-04-01-preview' });
  });

  it('never leaks the key inside an error and never throws', async () => {
    h.llmPing.mockRejectedValue(new Error('Auth failed for key super-secret-key-1'));
    const r = await testProvider('llm', { apiKey: 'super-secret-key-1', endpoint: 'https://e', deployment: 'd' });
    expect(r.ok).toBe(false);
    expect(r.error).not.toContain('super-secret-key-1');
  });
});

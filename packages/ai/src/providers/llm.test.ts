import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const h = vi.hoisted(() => ({ create: vi.fn(), log: vi.fn(), ctor: vi.fn() }));

vi.mock('openai', async (orig) => {
  const actual = await orig<typeof import('openai')>();
  class FakeAzure {
    chat = { completions: { create: h.create } };
    constructor(cfg: unknown) {
      h.ctor(cfg);
    }
  }
  return { ...actual, AzureOpenAI: FakeAzure };
});
vi.mock('./log.ts', async (orig) => ({ ...(await orig<typeof import('./log.ts')>()), logLlmCall: h.log }));

const { llmStructured, llmPing, normalizeEndpoint } = await import('./llm.ts');
const { TAG_SYSTEM_PROMPT, buildTagUserMessage, LlmTagSchema, LLM_PROMPT_VERSION } = await import('./llm-prompts.v1.ts');

const cfg = { apiKey: 'k-azure-123456', endpoint: 'https://res.openai.azure.com/', deployment: 'gpt-x', apiVersion: '2025-04-01-preview', model: 'gpt-x' };
const Schema = z.object({ a: z.number(), b: z.string().nullable() });
const completion = (content: string | null, extra: object = {}) => ({
  model: 'gpt-x-2026',
  choices: [{ message: { content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 800 } },
  ...extra,
});
const req = { schema: Schema, schemaName: 's', messages: [{ role: 'user' as const, content: 'hi' }] };

beforeEach(() => {
  h.create.mockReset();
  h.log.mockReset();
});

describe('normalizeEndpoint', () => {
  it.each([
    ['https://r.openai.azure.com/', 'https://r.openai.azure.com'],
    ['https://r.services.ai.azure.com/openai/deployments/x', 'https://r.services.ai.azure.com'],
    ['  https://r.openai.azure.com  ', 'https://r.openai.azure.com'],
  ])('%s', (input, out) => expect(normalizeEndpoint(input)).toBe(out));
});

describe('llmStructured', () => {
  it('parses valid JSON, reports input/output/cached tokens and logs them', async () => {
    h.create.mockResolvedValue(completion('{"a":1,"b":null}'));
    const r = await llmStructured(cfg, req, { purpose: 'tag_llm', runId: 3, jobId: 4, promptVersion: LLM_PROMPT_VERSION });
    expect(r.parsed).toEqual({ a: 1, b: null });
    expect(r.usage).toEqual({ inputTokens: 1000, outputTokens: 50, cachedTokens: 800 });
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'azure_openai', model: 'gpt-x', cachedTokens: 800, purpose: 'tag_llm', success: true, runId: 3 }),
    );
    const sent = h.create.mock.calls[0]![0];
    expect(sent.model).toBe('gpt-x');
    expect(sent.response_format.type).toBe('json_schema');
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.max_completion_tokens).toBeGreaterThan(0);
    expect(sent.temperature).toBeUndefined();
    expect(h.ctor.mock.calls[0]![0]).toMatchObject({ endpoint: 'https://res.openai.azure.com', deployment: 'gpt-x', apiVersion: '2025-04-01-preview' });
  });

  it('returns parseError (not an exception) for bad JSON, schema violations, empty replies and refusals', async () => {
    h.create.mockResolvedValueOnce(completion('not json'));
    expect((await llmStructured(cfg, req, { purpose: 'tag_llm' })).parseError).toMatch(/not valid JSON/);
    h.create.mockResolvedValueOnce(completion('{"a":"x","b":null}'));
    expect((await llmStructured(cfg, req, { purpose: 'tag_llm' })).parseError).toMatch(/a:/);
    h.create.mockResolvedValueOnce(completion(''));
    expect((await llmStructured(cfg, req, { purpose: 'tag_llm' })).parseError).toMatch(/Empty reply/);
    h.create.mockResolvedValueOnce({ ...completion(null), choices: [{ message: { content: null, refusal: 'no' } }] });
    expect((await llmStructured(cfg, req, { purpose: 'tag_llm' })).parseError).toMatch(/refused/);
  });

  it('logs a failed row and rethrows the exact provider error', async () => {
    h.create.mockRejectedValue(new Error('401 Access denied due to invalid subscription key'));
    await expect(llmStructured(cfg, req, { purpose: 'test' })).rejects.toThrow('401 Access denied due to invalid subscription key');
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ success: false, purpose: 'test', error: '401 Access denied due to invalid subscription key' }));
  });
});

describe('llmPing', () => {
  it('makes a tiny completion and returns the model the API reports', async () => {
    h.create.mockResolvedValue(completion('ok'));
    const r = await llmPing(cfg, { purpose: 'test' });
    expect(r.model).toBe('gpt-x-2026');
    expect(h.create.mock.calls[0]![0].max_completion_tokens).toBeLessThanOrEqual(16);
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ purpose: 'test', success: true }));
  });
});

describe('prompts', () => {
  it('keeps the stable instructions free of per-post data (cache friendly) and the schema strict-compatible', () => {
    expect(TAG_SYSTEM_PROMPT).not.toMatch(/<post>/);
    const msg = buildTagUserMessage({
      post: { source: 's', sourceJobId: '1', title: 'T', company: 'C', locationRaw: 'Pune', description: 'x'.repeat(5000), applyUrl: 'https://e.com', postedAt: null, employmentTypeRaw: null, compensationRaw: null, sourceHint: 'none' },
      ask: ['cities'],
      decided: { roleCategory: 'Other' },
      hints: [],
    });
    expect(msg.length).toBeLessThan(1800);
    expect(msg).toContain('Fill ONLY these fields: cities');
    expect(Object.keys(LlmTagSchema.shape)).toContain('confidence');
  });
});

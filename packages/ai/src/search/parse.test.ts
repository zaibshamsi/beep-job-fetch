import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getJevConfig: vi.fn(),
  getLlmConfig: vi.fn(),
  jevRequest: vi.fn(),
  llmStructured: vi.fn(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
}));

vi.mock('../settings/config.ts', () => ({ getJevConfig: h.getJevConfig, getLlmConfig: h.getLlmConfig }));
vi.mock('../providers/jev.ts', () => ({ jevRequest: h.jevRequest }));
vi.mock('../providers/llm.ts', () => ({ llmStructured: h.llmStructured }));
vi.mock('./cache.ts', async (orig) => ({ ...(await orig<typeof import('./cache.ts')>()), readCache: h.readCache, writeCache: h.writeCache }));

const { parseSearchQuery } = await import('./parse.ts');

const JEV = { apiKey: 'k', model: 'jev-latest' };
const LLM = { apiKey: 'k', endpoint: 'https://e', deployment: 'd', apiVersion: 'v', model: 'd' };
const llmReply = (over: object) => ({
  parsed: { keywords: [], roleCategory: null, cities: [], jobType: null, workMode: null, stipendMin: null, postedWithinDays: null, ...over },
  parseError: null,
  raw: '{}',
  usage: { inputTokens: 500, outputTokens: 40, cachedTokens: 0 },
  latencyMs: 300,
});

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.getJevConfig.mockResolvedValue(null);
  h.getLlmConfig.mockResolvedValue(null);
  h.readCache.mockResolvedValue(null);
});

describe('no keys: rule parser only', () => {
  it('parses, builds chips and a focus city, and caches', async () => {
    const r = await parseSearchQuery('python internships in pune with stipend');
    expect(r.parsedBy).toBe('rules');
    expect(r.filters).toEqual({ keywords: ['python'], cities: ['Pune'], jobType: 'internship', stipendMin: 1 });
    expect(r.focusCity).toBe('Pune');
    expect(r.chips.map((c) => c.label)).toEqual(['python', 'Pune', 'Internship', 'With stipend']);
    expect(h.writeCache).toHaveBeenCalledWith('python internships in pune with stipend', r.filters, 'rules');
    expect(h.llmStructured).not.toHaveBeenCalled();
  });

  it('empty query gives no filters and touches nothing', async () => {
    const r = await parseSearchQuery('   ');
    expect(r).toEqual({ filters: {}, chips: [], parsedBy: 'rules', focusCity: null });
    expect(h.readCache).not.toHaveBeenCalled();
  });
});

describe('cache', () => {
  it('returns a cached parse without calling any provider', async () => {
    h.getLlmConfig.mockResolvedValue(LLM);
    h.readCache.mockResolvedValue({ filters: { cities: ['Pune'], jobType: 'internship' }, parsedBy: 'llm' });
    const r = await parseSearchQuery('Pune internships');
    expect(r.parsedBy).toBe('cache');
    expect(r.focusCity).toBe('Pune');
    expect(h.llmStructured).not.toHaveBeenCalled();
    expect(h.writeCache).not.toHaveBeenCalled();
  });

  it('ignores a rules-only cache entry once an LLM is configured, and re-parses', async () => {
    h.getLlmConfig.mockResolvedValue(LLM);
    h.readCache.mockResolvedValue({ filters: { keywords: ['x'] }, parsedBy: 'rules' });
    h.llmStructured.mockResolvedValue(llmReply({ keywords: ['x'] }));
    const r = await parseSearchQuery('x jobs');
    expect(r.parsedBy).toBe('llm');
    expect(h.writeCache).toHaveBeenCalledWith('x jobs', expect.anything(), 'llm');
  });
});

describe('LLM configured', () => {
  beforeEach(() => h.getLlmConfig.mockResolvedValue(LLM));

  it('uses the LLM filters, validated, with rules winning on cities', async () => {
    h.llmStructured.mockResolvedValue(
      llmReply({ keywords: ['Rust', 'systems'], cities: ['Mumbai'], jobType: 'internship', roleCategory: 'Software Engineering', stipendMin: 15000 }),
    );
    const r = await parseSearchQuery('rust systems internship pune above 15k');
    expect(r.parsedBy).toBe('llm');
    expect(r.filters.cities).toEqual(['Pune']); // rules win
    expect(r.filters).toMatchObject({ keywords: ['rust', 'systems'], jobType: 'internship', roleCategory: 'Software Engineering', stipendMin: 15000 });
    expect(h.llmStructured.mock.calls[0]![2]).toMatchObject({ purpose: 'search_parse', promptVersion: 'llm.v1' });
  });

  it('fills what the rules missed: odd phrasing, LLM city normalised, Remote city becomes work mode', async () => {
    h.llmStructured.mockResolvedValue(llmReply({ cities: ['Bangalore', 'Remote', 'Atlantis'], roleCategory: 'Marketing' }));
    const r = await parseSearchQuery('something to do with growing brands, maybe in the garden city');
    expect(r.filters.cities).toEqual(['Bengaluru']);
    expect(r.filters.workMode).toBe('remote');
    expect(r.filters.roleCategory).toBe('Marketing');
    expect(r.focusCity).toBe('Bengaluru');
  });

  it('falls back to rules when the LLM errors or returns invalid output, and does not cache that', async () => {
    h.llmStructured.mockRejectedValueOnce(new Error('timeout'));
    let r = await parseSearchQuery('python internships in pune');
    expect(r.parsedBy).toBe('rules');
    expect(r.filters.cities).toEqual(['Pune']);
    h.llmStructured.mockResolvedValueOnce({ parsed: null, parseError: 'bad', raw: '', usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, latencyMs: 1 });
    r = await parseSearchQuery('python internships in pune');
    expect(r.parsedBy).toBe('rules');
    expect(h.writeCache).not.toHaveBeenCalled();
  });
});

describe('Jev only', () => {
  beforeEach(() => h.getJevConfig.mockResolvedValue(JEV));

  it('asks Choice questions only for the fields the rules left null', async () => {
    h.jevRequest.mockResolvedValue({
      answers: {
        role: { type: 'choice', choice: 'data_ai_ml', confidence: 0.92 },
        jobType: { type: 'choice', choice: 'internship', confidence: 0.95 },
      },
      model: 'jev-latest',
      usage: { inputTokens: 900, outputTokens: 0 },
      latencyMs: 60,
    });
    const r = await parseSearchQuery('pytorch pune');
    expect(r.parsedBy).toBe('jev');
    const [, , questions, meta] = h.jevRequest.mock.calls[0]!;
    expect(Object.keys(questions)).toEqual(['role', 'jobType']);
    expect(meta).toMatchObject({ purpose: 'search_parse' });
    expect(r.filters).toMatchObject({ roleCategory: 'Data / AI / ML', jobType: 'internship', cities: ['Pune'], keywords: ['pytorch'] });
  });

  it('skips fields the rules already know and ignores low-confidence guesses', async () => {
    h.jevRequest.mockResolvedValue({
      answers: { role: { type: 'choice', choice: 'marketing', confidence: 0.5 } },
      model: 'm',
      usage: { inputTokens: 1, outputTokens: 0 },
      latencyMs: 1,
    });
    const r = await parseSearchQuery('flutter internship');
    expect(Object.keys(h.jevRequest.mock.calls[0]![2])).toEqual(['role']);
    expect(r.filters.roleCategory).toBeUndefined();
    expect(r.filters.jobType).toBe('internship');
  });

  it('makes no Jev call when nothing is left to classify, and survives a Jev failure', async () => {
    await parseSearchQuery('internships in pune');
    expect(h.jevRequest).not.toHaveBeenCalled();
    h.jevRequest.mockRejectedValue(new Error('down'));
    const r = await parseSearchQuery('terraform pune');
    expect(r.parsedBy).toBe('rules');
    expect(r.filters.keywords).toEqual(['terraform']);
  });
});

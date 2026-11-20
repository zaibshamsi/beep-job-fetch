import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPost } from '@beep/shared';
import type { RuleTagResult } from '../contracts.ts';
import type { JevClassification } from '../providers/jev.ts';
import type { LlmTag } from '../providers/llm-prompts.v1.ts';

const h = vi.hoisted(() => ({
  ruleTag: vi.fn(),
  fresherCheck: vi.fn(),
  getJevConfig: vi.fn(),
  getLlmConfig: vi.fn(),
  jevClassify: vi.fn(),
  llmStructured: vi.fn(),
}));

vi.mock('../rules/index.ts', () => ({ ruleTag: h.ruleTag, fresherCheck: h.fresherCheck }));
vi.mock('../settings/config.ts', () => ({ getJevConfig: h.getJevConfig, getLlmConfig: h.getLlmConfig }));
vi.mock('../providers/jev.ts', () => ({ jevClassify: h.jevClassify }));
vi.mock('../providers/llm.ts', () => ({ llmStructured: h.llmStructured }));

const { enrichPost } = await import('./index.ts');

const post: JobPost = {
  source: 'test',
  sourceJobId: '1',
  title: 'Associate Engineer',
  company: 'Acme',
  locationRaw: 'Pune, India',
  description: 'Join our team in Pune.',
  applyUrl: 'https://example.com/1',
  postedAt: null,
  employmentTypeRaw: null,
  compensationRaw: null,
  sourceHint: 'none',
};

const noRules = (over: Partial<RuleTagResult> = {}): RuleTagResult => ({
  cities: [],
  workModeHint: null,
  jobTypeHint: null,
  roleHint: null,
  roleConfidence: 0,
  fresher: 'unknown',
  experienceMinYears: null,
  experienceMaxYears: null,
  stipendMinMonthlyInr: null,
  stipendMaxMonthlyInr: null,
  skills: [],
  ...over,
});

const jevAnswer = (confidence: number, over: Partial<JevClassification> = {}): JevClassification => ({
  role: { value: 'Software Engineering', confidence },
  jobType: { value: 'full_time', confidence },
  workMode: { value: 'onsite', confidence },
  isFresher: { value: true, probability: confidence, confidence },
  city: null,
  model: 'jev-latest',
  usage: { inputTokens: 1400, outputTokens: 0 },
  latencyMs: 50,
  ...over,
});

const llmTag = (over: Partial<LlmTag> = {}): LlmTag => ({
  roleCategory: null,
  cities: null,
  workMode: null,
  jobType: null,
  isFresher: null,
  experienceMinYears: null,
  experienceMaxYears: null,
  stipendMinMonthlyInr: null,
  stipendMaxMonthlyInr: null,
  skills: null,
  confidence: 0.9,
  ...over,
});
const llmOk = (tag: LlmTag) => ({ parsed: tag, parseError: null, raw: JSON.stringify(tag), usage: { inputTokens: 900, outputTokens: 60, cachedTokens: 0 }, latencyMs: 400 });
const llmBad = (error: string) => ({ parsed: null, parseError: error, raw: '{"bad":true}', usage: { inputTokens: 900, outputTokens: 10, cachedTokens: 0 }, latencyMs: 300 });

const JEV_CFG = { apiKey: 'k', model: 'jev-latest' };
const LLM_CFG = { apiKey: 'k', endpoint: 'https://e', deployment: 'd', apiVersion: 'v', model: 'd' };

function keys(jev: boolean, llm: boolean) {
  h.getJevConfig.mockResolvedValue(jev ? JEV_CFG : null);
  h.getLlmConfig.mockResolvedValue(llm ? LLM_CFG : null);
}

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset();
  h.fresherCheck.mockReturnValue({ verdict: 'unknown', reason: 'none' });
  h.ruleTag.mockReturnValue(noRules({ cities: ['Pune'] }));
  keys(true, true);
});

describe('routing: all confident skips the LLM', () => {
  it('Jev >= 0.7 everywhere and cities from rules -> no LLM call', async () => {
    h.jevClassify.mockResolvedValue(jevAnswer(0.95));
    const r = await enrichPost(post, { runId: 1, jobId: 2 });
    expect(h.llmStructured).not.toHaveBeenCalled();
    expect(h.jevClassify).toHaveBeenCalledWith(post, expect.objectContaining({ runId: 1, jobId: 2 }));
    expect(r.used).toEqual({ jev: true, llm: false });
    expect(r.needsReview).toBe(false);
    expect(r.enrichment).toMatchObject({ roleCategory: 'Software Engineering', cities: ['Pune'], jobType: 'full_time', isFresher: true });
    expect(r.enrichment.confidence).toBe(0.9); // min(rules cities 0.9, jev 0.95)
    expect(r.provenance).toMatchObject({ roleCategory: 'jev', jobType: 'jev', workMode: 'jev', isFresher: 'jev', cities: 'rules' });
    expect(r.promptVersion).toBe('jev.v1');
  });

  it('strong rules settle fields so Jev answers do not matter', async () => {
    h.ruleTag.mockReturnValue(
      noRules({ cities: ['Pune'], roleHint: 'Data / AI / ML', roleConfidence: 0.9, jobTypeHint: 'internship', workModeHint: 'remote', fresher: 'yes' }),
    );
    h.jevClassify.mockResolvedValue(jevAnswer(0.4));
    const r = await enrichPost(post);
    expect(h.llmStructured).not.toHaveBeenCalled();
    expect(r.enrichment).toMatchObject({ roleCategory: 'Data / AI / ML', jobType: 'internship', workMode: 'remote' });
    expect(r.provenance.roleCategory).toBe('rules');
    expect(r.needsReview).toBe(false);
  });
});

describe('routing: low confidence or missing free values call the LLM', () => {
  it('asks only for the low-confidence field and records llm provenance', async () => {
    h.jevClassify.mockResolvedValue(jevAnswer(0.9, { role: { value: 'Other', confidence: 0.4 } }));
    h.llmStructured.mockResolvedValue(llmOk(llmTag({ roleCategory: 'QA / Testing', confidence: 0.85 })));
    const r = await enrichPost(post);
    expect(h.llmStructured).toHaveBeenCalledTimes(1);
    const [, req, meta] = h.llmStructured.mock.calls[0]!;
    const user = req.messages[1].content as string;
    expect(user).toContain('Fill ONLY these fields: roleCategory');
    expect(user).toContain('"Other" (40% sure)');
    expect(user).toContain('jobType = "full_time"');
    expect(meta).toMatchObject({ purpose: 'tag_llm', promptVersion: 'llm.v1' });
    expect(r.enrichment.roleCategory).toBe('QA / Testing');
    expect(r.provenance.roleCategory).toBe('llm');
    expect(r.provenance.jobType).toBe('jev');
    expect(r.used).toEqual({ jev: true, llm: true });
    expect(r.enrichment.confidence).toBe(0.85);
    expect(r.needsReview).toBe(false);
    expect(r.promptVersion).toBe('jev.v1+llm.v1');
  });

  it('a place in the text with no city found by rules goes to the LLM, which fills cities', async () => {
    h.ruleTag.mockReturnValue(noRules({ cities: [] }));
    h.jevClassify.mockResolvedValue(jevAnswer(0.95));
    h.llmStructured.mockResolvedValue(llmOk(llmTag({ cities: ['Bangalore', 'Kochi'], confidence: 0.9 })));
    const r = await enrichPost({ ...post, locationRaw: 'Bangalore / Kochi' });
    expect(h.llmStructured).toHaveBeenCalledTimes(1);
    expect(r.enrichment.cities).toEqual(['Bengaluru', 'Kochi']); // alias normalised through the gazetteer
    expect(r.provenance.cities).toBe('llm');
  });

  it('stipend in the text that rules missed goes to the LLM', async () => {
    h.jevClassify.mockResolvedValue(jevAnswer(0.95));
    h.llmStructured.mockResolvedValue(llmOk(llmTag({ stipendMinMonthlyInr: 15000, stipendMaxMonthlyInr: 20000, confidence: 0.9 })));
    const r = await enrichPost({ ...post, compensationRaw: 'Rs 15k - 20k per month' });
    expect(h.llmStructured.mock.calls[0]![1].messages[1].content).toContain('stipend');
    expect(r.enrichment).toMatchObject({ stipendMinMonthlyInr: 15000, stipendMaxMonthlyInr: 20000 });
    expect(r.provenance.stipendMinMonthlyInr).toBe('llm');
  });

  it('with only an LLM key, the LLM fills every field the rules could not', async () => {
    keys(false, true);
    h.llmStructured.mockResolvedValue(
      llmOk(llmTag({ roleCategory: 'Marketing', jobType: 'internship', workMode: 'hybrid', isFresher: true, confidence: 0.9 })),
    );
    const r = await enrichPost(post);
    expect(h.jevClassify).not.toHaveBeenCalled();
    expect(r.used).toEqual({ jev: false, llm: true });
    expect(r.enrichment).toMatchObject({ roleCategory: 'Marketing', jobType: 'internship', workMode: 'hybrid' });
    expect(r.needsReview).toBe(false);
  });

  it('Jev picks the primary city when rules found several', async () => {
    h.ruleTag.mockReturnValue(noRules({ cities: ['Pune', 'Mumbai'] }));
    h.jevClassify.mockResolvedValue(jevAnswer(0.95, { city: { value: 'Mumbai', confidence: 0.9 } }));
    const r = await enrichPost(post);
    expect(h.jevClassify.mock.calls[0]![1].candidateCities).toEqual(['Pune', 'Mumbai']);
    expect(r.enrichment.cities).toEqual(['Mumbai', 'Pune']);
  });
});

describe('validate / repair loop', () => {
  beforeEach(() => {
    h.jevClassify.mockResolvedValue(jevAnswer(0.9, { role: { value: 'Other', confidence: 0.3 } }));
  });

  it('invalid city output is fed back once, then accepted', async () => {
    h.ruleTag.mockReturnValue(noRules({ cities: [] }));
    h.llmStructured
      .mockResolvedValueOnce(llmOk(llmTag({ roleCategory: 'Marketing', cities: ['Atlantis'] })))
      .mockResolvedValueOnce(llmOk(llmTag({ roleCategory: 'Marketing', cities: ['Pune'] })));
    const r = await enrichPost(post);
    expect(h.llmStructured).toHaveBeenCalledTimes(2);
    const second = h.llmStructured.mock.calls[1]![1].messages as { role: string; content: string }[];
    expect(second.at(-1)!.content).toContain('city "Atlantis" is not in the known Indian city list');
    expect(second.at(-2)!.role).toBe('assistant');
    expect(r.enrichment.cities).toEqual(['Pune']);
    expect(r.needsReview).toBe(false);
  });

  it('gives up after 2 retries, keeps rules + Jev tags and sets needsReview', async () => {
    h.llmStructured.mockResolvedValue(llmBad('roleCategory: Invalid enum value'));
    const r = await enrichPost(post);
    expect(h.llmStructured).toHaveBeenCalledTimes(3); // first try + 2 repairs
    expect(r.needsReview).toBe(true);
    expect(r.enrichment.roleCategory).toBe('Other'); // Jev's low-confidence guess survives
    expect(r.provenance.roleCategory).toBe('jev');
    expect(r.enrichment.cities).toEqual(['Pune']);
  });

  it('unknown cities three times in a row also end in needsReview', async () => {
    h.ruleTag.mockReturnValue(noRules({ cities: [] }));
    h.llmStructured.mockResolvedValue(llmOk(llmTag({ roleCategory: 'Marketing', cities: ['Atlantis'] })));
    const r = await enrichPost(post);
    expect(h.llmStructured).toHaveBeenCalledTimes(3);
    expect(r.needsReview).toBe(true);
    expect(r.provenance.cities).not.toBe('llm');
  });

  it('low LLM confidence after all steps sets needsReview', async () => {
    h.llmStructured.mockResolvedValue(llmOk(llmTag({ roleCategory: 'Marketing', confidence: 0.5 })));
    const r = await enrichPost(post);
    expect(r.enrichment.confidence).toBe(0.5);
    expect(r.needsReview).toBe(true);
  });
});

describe('graceful degradation', () => {
  it('no keys: rules only, never throws, undecided post needs review', async () => {
    keys(false, false);
    const r = await enrichPost(post);
    expect(h.jevClassify).not.toHaveBeenCalled();
    expect(h.llmStructured).not.toHaveBeenCalled();
    expect(r.used).toEqual({ jev: false, llm: false });
    expect(r.needsReview).toBe(true);
    expect(r.enrichment.roleCategory).toBe('Other');
    expect(r.promptVersion).toBe('rules');
  });

  it('no keys: a post the rules fully decide needs no review', async () => {
    keys(false, false);
    h.ruleTag.mockReturnValue(noRules({ cities: ['Pune'], roleHint: 'Software Engineering', roleConfidence: 0.9, jobTypeHint: 'internship', fresher: 'yes' }));
    const r = await enrichPost(post);
    expect(r.needsReview).toBe(false);
    expect(r.enrichment).toMatchObject({ roleCategory: 'Software Engineering', cities: ['Pune'], isFresher: true });
    expect(r.provenance.roleCategory).toBe('rules');
  });

  it('remote post without a city gets Remote', async () => {
    keys(false, false);
    h.ruleTag.mockReturnValue(noRules({ cities: [], workModeHint: 'remote', roleHint: 'Marketing', roleConfidence: 0.9, fresher: 'yes' }));
    const r = await enrichPost({ ...post, locationRaw: 'Remote' });
    expect(r.enrichment.cities).toEqual(['Remote']);
    expect(r.needsReview).toBe(false);
  });

  it('a Jev error falls back to the LLM and flags review', async () => {
    h.jevClassify.mockRejectedValue(new Error('503 upstream'));
    h.llmStructured.mockResolvedValue(
      llmOk(llmTag({ roleCategory: 'Marketing', jobType: 'full_time', workMode: 'onsite', isFresher: true })),
    );
    const r = await enrichPost(post);
    expect(r.enrichment.roleCategory).toBe('Marketing');
    expect(r.needsReview).toBe(true);
  });

  it('an LLM error keeps the Jev + rules result and flags review', async () => {
    h.jevClassify.mockResolvedValue(jevAnswer(0.5));
    h.llmStructured.mockRejectedValue(new Error('401 bad key'));
    const r = await enrichPost(post);
    expect(r.needsReview).toBe(true);
    expect(r.enrichment.roleCategory).toBe('Software Engineering');
    expect(r.provenance.roleCategory).toBe('jev');
    expect(h.llmStructured).toHaveBeenCalledTimes(1); // no retry storm on a transport error
  });

  it('both providers failing still returns a result', async () => {
    h.jevClassify.mockRejectedValue(new Error('x'));
    h.llmStructured.mockRejectedValue(new Error('y'));
    const r = await enrichPost(post);
    expect(r.needsReview).toBe(true);
    expect(r.enrichment.cities).toEqual(['Pune']);
  });

  it('even a crash inside rules yields a review-flagged empty result', async () => {
    h.ruleTag.mockImplementation(() => {
      throw new Error('regex blew up');
    });
    const r = await enrichPost(post);
    expect(r.needsReview).toBe(true);
    expect(r.enrichment.confidence).toBe(0);
  });
});

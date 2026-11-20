import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPost } from '@beep/shared';

const h = vi.hoisted(() => ({ systemOne: vi.fn(), log: vi.fn(), ctor: vi.fn() }));

vi.mock('@typesafe-ai/sdk', async (orig) => {
  const actual = await orig<typeof import('@typesafe-ai/sdk')>();
  class FakeClient {
    constructor(cfg: unknown) {
      h.ctor(cfg);
    }
    systemOne = h.systemOne;
  }
  return { ...actual, TypeSafeClient: FakeClient };
});
vi.mock('./log.ts', async (orig) => ({ ...(await orig<typeof import('./log.ts')>()), logLlmCall: h.log }));
vi.mock('../settings/config.ts', () => ({ getJevConfig: vi.fn(async () => ({ apiKey: 'k-jev-123456', model: 'jev-latest' })) }));

const { jevClassify, mapJevAnswers } = await import('./jev.ts');
const { buildJevQuestions, roleSlug, JEV_PROMPT_VERSION, ROLE_DESCRIPTIONS } = await import('./jev-questions.v1.ts');
const { ROLE_CATEGORIES } = await import('@beep/shared');

const post: JobPost = {
  source: 't',
  sourceJobId: '1',
  title: 'Python Intern',
  company: 'Acme',
  locationRaw: 'Pune, India',
  description: 'Learn to build APIs. '.repeat(200),
  applyUrl: 'https://example.com/1',
  postedAt: null,
  employmentTypeRaw: null,
  compensationRaw: null,
  sourceHint: 'none',
};

beforeEach(() => {
  h.systemOne.mockReset();
  h.log.mockReset();
});

describe('question definitions', () => {
  it('has a described Choice option for every one of the 18 roles, with safe slug labels', () => {
    const q = buildJevQuestions() as any;
    expect(Object.keys(q.role.criteria)).toHaveLength(ROLE_CATEGORIES.length);
    expect(Object.keys(q.role.criteria)).toContain('data_ai_ml');
    for (const r of ROLE_CATEGORIES) {
      expect(ROLE_DESCRIPTIONS[r].length).toBeGreaterThan(20);
      expect(q.role.criteria[roleSlug(r)]).toContain(r);
    }
    expect(q.isFresher.type).toBe('noul');
    expect(q.city).toBeUndefined();
  });

  it('adds the city Choice only for 2+ candidates', () => {
    expect((buildJevQuestions({ candidateCities: ['Pune'] }) as any).city).toBeUndefined();
    const q = buildJevQuestions({ candidateCities: ['Pune', 'Mumbai'] }) as any;
    expect(Object.keys(q.city.criteria)).toEqual(['Pune', 'Mumbai']);
  });
});

describe('mapJevAnswers', () => {
  it('maps choices, noul confidence and rejects labels outside the closed lists', () => {
    const m = mapJevAnswers({
      role: { type: 'choice', choice: 'data_ai_ml', confidence: 0.91 },
      jobType: { type: 'choice', choice: 'internship', confidence: 0.8 },
      workMode: { type: 'choice', choice: 'weird', confidence: 0.9 },
      isFresher: { type: 'noul', noul: 0.12 },
    });
    expect(m.role).toEqual({ value: 'Data / AI / ML', confidence: 0.91 });
    expect(m.jobType).toEqual({ value: 'internship', confidence: 0.8 });
    expect(m.workMode).toBeNull();
    expect(m.isFresher).toMatchObject({ value: false, probability: 0.12 });
    expect(m.isFresher!.confidence).toBeCloseTo(0.88);
  });

  it('only accepts a city that was offered', () => {
    expect(mapJevAnswers({ city: { type: 'choice', choice: 'Delhi', confidence: 0.9 } }, ['Pune', 'Mumbai']).city).toBeNull();
    expect(mapJevAnswers({ city: { type: 'choice', choice: 'Pune', confidence: 0.9 } }, ['Pune', 'Mumbai']).city?.value).toBe('Pune');
  });
});

describe('jevClassify', () => {
  it('sends one request with several questions, caps the description and logs tokens', async () => {
    h.systemOne.mockResolvedValue({
      model: 'jev-latest',
      usage: { input_tokens: 1400, output_tokens: 3 },
      answers: {
        role: { type: 'choice', choice: 'software_engineering', confidence: 0.95 },
        jobType: { type: 'choice', choice: 'internship', confidence: 0.99 },
        workMode: { type: 'choice', choice: 'onsite', confidence: 0.7 },
        isFresher: { type: 'noul', noul: 0.97 },
      },
    });
    const r = await jevClassify(post, { runId: 7, jobId: 9 });
    expect(r.role?.value).toBe('Software Engineering');
    expect(r.usage).toEqual({ inputTokens: 1400, outputTokens: 3 });

    expect(h.systemOne).toHaveBeenCalledTimes(1);
    const req = h.systemOne.mock.calls[0]![0];
    expect(Object.keys(req.questions)).toEqual(['role', 'jobType', 'workMode', 'isFresher']);
    expect(req.state.length).toBeLessThan(1900);
    expect(h.log).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'tag_jev', provider: 'jev', runId: 7, jobId: 9, inputTokens: 1400, promptVersion: JEV_PROMPT_VERSION, success: true }),
    );
  });

  it('logs the failure and rethrows the provider error', async () => {
    h.systemOne.mockRejectedValue(new Error('429 rate limited'));
    await expect(jevClassify(post)).rejects.toThrow('429 rate limited');
    expect(h.log).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: '429 rate limited' }));
  });

  it('never logs the post body', async () => {
    h.systemOne.mockResolvedValue({ model: 'm', usage: { input_tokens: 1, output_tokens: 0 }, answers: {} });
    await jevClassify(post);
    expect(JSON.stringify(h.log.mock.calls)).not.toContain('Learn to build');
  });
});

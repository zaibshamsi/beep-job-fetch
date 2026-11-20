/**
 * Live provider checks. Needs real keys in .env (JEV_API_KEY and/or AZURE_OPENAI_*); each block is skipped when
 * its keys are absent, so `vitest run` stays green offline. Writes llm_calls rows only if the DB is reachable.
 */
import { describe, expect, it } from 'vitest';
import { env } from '@beep/shared';
import type { JobPost } from '@beep/shared';
import { jevClassify } from './providers/jev.ts';
import { llmStructured } from './providers/llm.ts';
import { LLM_PROMPT_VERSION, LlmTagSchema, TAG_SYSTEM_PROMPT, buildTagUserMessage } from './providers/llm-prompts.v1.ts';
import { enrichPost } from './enrich/index.ts';
import { parseSearchQuery } from './search/index.ts';
import { testProvider } from './settings/index.ts';

const hasJev = !!env.jev.apiKey;
const hasLlm = !!(env.azure.apiKey && env.azure.endpoint && env.azure.deployment);

const post: JobPost = {
  source: 'int-test',
  sourceJobId: '1',
  title: 'Python Developer Intern',
  company: 'Acme Labs',
  locationRaw: 'Pune, Maharashtra',
  description: 'We are hiring interns for our Pune office. Stipend Rs 15,000 per month. Skills: Python, Django, SQL. 0-1 years of experience. Hybrid.',
  applyUrl: 'https://example.com/jobs/1',
  postedAt: null,
  employmentTypeRaw: 'Internship',
  compensationRaw: null,
  sourceHint: 'none',
};

describe.skipIf(!hasJev)('Jev (live)', () => {
  it('testProvider succeeds with the configured key', async () => {
    const r = await testProvider('jev');
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
  }, 30_000);

  it('classifies a clear fresher post with high confidence', async () => {
    const r = await jevClassify(post, { candidateCities: ['Pune', 'Mumbai'] });
    expect(r.role?.value).toBe('Software Engineering');
    expect(r.jobType?.value).toBe('internship');
    expect(r.isFresher?.value).toBe(true);
    expect(r.usage.inputTokens).toBeGreaterThan(0);
  }, 30_000);
});

describe.skipIf(!hasLlm)('Azure LLM (live)', () => {
  it('testProvider succeeds with the configured deployment', async () => {
    const r = await testProvider('llm');
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
  }, 60_000);

  it('returns schema-valid structured tags and reports token usage', async () => {
    const cfg = { apiKey: env.azure.apiKey, endpoint: env.azure.endpoint, deployment: env.azure.deployment, apiVersion: env.azure.apiVersion, model: env.azure.deployment };
    const r = await llmStructured(
      cfg,
      {
        schema: LlmTagSchema,
        schemaName: 'job_tags',
        messages: [
          { role: 'system', content: TAG_SYSTEM_PROMPT },
          { role: 'user', content: buildTagUserMessage({ post, ask: ['roleCategory', 'cities', 'stipend', 'skills'], decided: {}, hints: [] }) },
        ],
      },
      { purpose: 'test', promptVersion: LLM_PROMPT_VERSION },
    );
    expect(r.parseError).toBeNull();
    expect(r.parsed?.cities).toContain('Pune');
    expect(r.parsed?.stipendMinMonthlyInr).toBe(15000);
    expect(r.usage.inputTokens).toBeGreaterThan(0);
  }, 90_000);
});

describe.skipIf(!hasJev && !hasLlm)('pipeline entry points (live)', () => {
  it('enrichPost produces a complete, valid result', async () => {
    const r = await enrichPost(post);
    expect(r.enrichment.cities).toContain('Pune');
    expect(r.enrichment.jobType).toBe('internship');
    expect(r.enrichment.isFresher).toBe(true);
    expect(r.used.jev || r.used.llm || r.needsReview).toBe(true);
  }, 120_000);

  it('parseSearchQuery understands a natural query', async () => {
    const r = await parseSearchQuery('python internships in pune with stipend');
    expect(r.filters.cities).toEqual(['Pune']);
    expect(r.filters.jobType).toBe('internship');
    expect(r.filters.stipendMin).toBeGreaterThanOrEqual(1);
  }, 60_000);
});

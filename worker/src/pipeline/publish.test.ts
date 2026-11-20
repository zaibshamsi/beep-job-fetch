import type { Enrichment } from '@beep/shared';
import { describe, expect, it } from 'vitest';
import { makeCandidate } from './dedupe.ts';
import { batchTouches, buildInsertSql, buildRetagSql, buildSearchText, buildTouchSql, buildUpdateSql } from './publish.ts';
import { makePost } from './test-helpers.ts';
import type { Enriched } from './types.ts';

const enrichment: Enrichment = {
  roleCategory: 'Business / Data Analyst',
  cities: ['Pune', 'Remote'],
  workMode: 'hybrid',
  jobType: 'internship',
  isFresher: false,
  experienceMinYears: 0,
  experienceMaxYears: 1.5,
  stipendMinMonthlyInr: 10000.4,
  stipendMaxMonthlyInr: null,
  skills: ['SQL', 'Excel'],
  confidence: 0.8,
};
const item = (): Enriched => ({
  cand: makeCandidate(makePost({ title: 'Data Intern', company: 'Acme' }), 'yes', () => []),
  enrichment,
  provenance: { roleCategory: 'jev' },
  needsReview: true,
  promptVersion: 'v1',
  used: { jev: true, llm: false },
  fromCache: false,
});

/** Every @name used in the SQL must have a param (except SQL variables), and no param may be unused. */
const paramsMatch = (sql: string, params: Record<string, unknown>, variables: string[] = ['ROWCOUNT']) => {
  const used = new Set([...sql.matchAll(/@(\w+)/g)].map((m) => m[1]!).filter((n) => !variables.includes(n)));
  const declared = new Set(Object.keys(params));
  return {
    missing: [...used].filter((n) => !declared.has(n)),
    unused: [...declared].filter((n) => !used.has(n)),
  };
};

describe('buildSearchText', () => {
  it('lower-cases title, company, role, cities, skills and location', () => {
    const text = buildSearchText(makePost({ title: 'Data Intern', company: 'Acme', locationRaw: 'Pune, MH' }), enrichment);
    expect(text).toBe('data intern acme business / data analyst pune remote sql excel pune, mh');
  });
});

describe('SQL builders', () => {
  it('insert: parameters line up, Remote has no city lookup, stipend is rounded', () => {
    const { sql, params } = buildInsertSql(item());
    expect(paramsMatch(sql, params, ['ROWCOUNT', 'id'])).toEqual({ missing: [], unused: [] });
    expect(Object.values(params)).toContain('Pune');
    expect(Object.values(params)).not.toContain('Remote');
    expect(params.stipMin).toBe(10000);
    expect(params.isFresher).toBe(0);
    expect(params.needsReview).toBe(1);
    expect(JSON.parse(params.skills as string)).toEqual(['SQL', 'Excel']);
    expect(sql).toContain('SELECT @id AS id');
  });

  it('insert without real cities emits no job_cities statement', () => {
    const it = item();
    it.enrichment = { ...enrichment, cities: ['Remote'] };
    expect(buildInsertSql(it).sql).not.toContain('job_cities');
  });

  it('update: replaces cities and upserts links', () => {
    const it = item();
    const { sql, params } = buildUpdateSql(5, it, it.cand.links);
    expect(paramsMatch(sql, params)).toEqual({ missing: [], unused: [] });
    expect(sql).toContain('DELETE FROM job_cities');
    expect(sql).toContain("status = 'active'");
    expect(params.id).toBe(5);
  });

  it('retag: updates tag columns and cities only, never the sighting fields', () => {
    const { sql, params } = buildRetagSql(5, item());
    expect(paramsMatch(sql, params)).toEqual({ missing: [], unused: [] });
    expect(sql).toContain('prompt_version = @promptVersion');
    expect(sql).not.toMatch(/last_seen_at|missed_runs|description|title/);
  });

  it('touch batch: parameters line up and reset missed_runs', () => {
    const link = (n: string) => ({ source: 's', sourceJobId: n, applyUrl: `https://x.test/${n}` });
    const { sql, params } = buildTouchSql([
      { jobId: 1, links: [link('a')] },
      { jobId: 2, links: [link('b'), link('c')], description: 'longer' },
    ]);
    expect(paramsMatch(sql, params)).toEqual({ missing: [], unused: [] });
    expect(sql).toContain('missed_runs = 0');
    expect(params.d1).toBe('longer');
  });
});

describe('batchTouches', () => {
  it('keeps every batch under the parameter budget', () => {
    const touches = Array.from({ length: 500 }, (_, i) => ({
      jobId: i,
      links: [{ source: 's', sourceJobId: String(i), applyUrl: 'https://x.test' }],
    }));
    const batches = batchTouches(touches, 1800);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat()).toHaveLength(500);
    for (const b of batches) expect(Object.keys(buildTouchSql(b).params).length).toBeLessThanOrEqual(1800);
  });
});

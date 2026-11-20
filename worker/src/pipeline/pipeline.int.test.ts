import type { EnrichResult } from '@beep/ai';
import { closePool, query, type JobPost, type RawPost } from '@beep/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPipeline, type RunOutcome } from './run.ts';
import { fakeAdapter, makePost } from './test-helpers.ts';

/** Runs against the real local DB. Everything it creates is tagged with these source names and removed afterwards. */
const A = 'test_fake';
const B = 'test_fake_b';
const runIds: number[] = [];

const raw = (source: string, p: Partial<JobPost> & { sourceJobId: string }): RawPost => ({
  source,
  sourceJobId: p.sourceJobId,
  payload: makePost({ source, ...p }),
});

const unique = (id: string, company: string, title: string, loc = 'Pune') =>
  raw(A, { sourceJobId: id, company, title, locationRaw: loc, applyUrl: `https://test-fake.example/${id}` });

/** 20 raw posts -> 11 jobs: 9 unique + 2 fuzzy pairs; 2 exact duplicates, 3 not-fresher, 2 invalid. */
function twentyPosts(): RawPost[] {
  return [
    ...[
      ['u1', 'Zzfake Alpha', 'Backend Intern'],
      ['u2', 'Zzfake Beta', 'Data Analyst Trainee'],
      ['u3', 'Zzfake Gamma', 'Graphic Design Intern'],
      ['u4', 'Zzfake Delta', 'Finance Graduate Trainee'],
      ['u5', 'Zzfake Epsilon', 'Sales Associate Fresher'],
      ['u6', 'Zzfake Zeta', 'Experienced Lead Role'],
      ['u7', 'Zzfake Eta', 'Content Writer Intern'],
      ['u8', 'Zzfake Theta', 'Mechanical Engineer Trainee'],
      ['u9', 'Zzfake Iota', 'Operations Intern'],
    ].map(([id, c, t]) => unique(id!, c!, t!, id === 'u8' ? 'Bengaluru' : 'Pune')),
    // exact: same source id again, and same apply URL under another id
    unique('u1', 'Zzfake Alpha', 'Backend Intern'),
    raw(A, { sourceJobId: 'u2-copy', company: 'Zzfake Beta', title: 'Data Analyst Trainee', locationRaw: 'Pune', applyUrl: 'https://test-fake.example/u2' }),
    // fuzzy: same company and city, near-identical title, different URL
    unique('f1', 'Zzfake Kappa', 'Machine Learning Intern'),
    unique('f1b', 'Zzfake Kappa', 'Machine Learning - Intern'),
    unique('f2', 'Zzfake Lambda', 'Cloud Support Trainee'),
    unique('f2b', 'Zzfake Lambda', 'Cloud Support - Trainee'),
    // not fresher
    unique('s1', 'Zzfake Mu', 'Senior Architect'),
    unique('s2', 'Zzfake Nu', 'Senior Manager'),
    unique('s3', 'Zzfake Xi', 'Senior Director'),
    // invalid: bad URL, and one the adapter rejects
    unique('bad1', 'Zzfake Omicron', 'Broken Link Intern'),
    unique('bad2', 'Zzfake Pi', 'Filtered Out Intern'),
  ].map((r) => (r.sourceJobId === 'bad1' ? { ...r, payload: { ...(r.payload as object), applyUrl: 'not a url' } } : r));
}

const adapterA = (raws: () => RawPost[]) =>
  fakeAdapter({ name: A, raws: async () => raws(), normalize: (r) => (r.sourceJobId === 'bad2' ? null : (r.payload as JobPost)) });

const fresherCheck = (p: JobPost) => ({
  verdict: /senior/i.test(p.title) ? ('no' as const) : /experienced/i.test(p.title) ? ('unknown' as const) : ('yes' as const),
  reason: 'test',
});

const enrich = async (post: JobPost): Promise<EnrichResult> => ({
  enrichment: {
    roleCategory: 'Software Engineering',
    cities: [post.locationRaw.includes('Bengaluru') ? 'Bengaluru' : 'Pune'],
    workMode: 'onsite',
    jobType: 'internship',
    isFresher: !/experienced/i.test(post.title),
    experienceMinYears: 0,
    experienceMaxYears: null,
    stipendMinMonthlyInr: null,
    stipendMaxMonthlyInr: null,
    skills: ['python'],
    confidence: 0.9,
  },
  provenance: { roleCategory: 'rules' },
  needsReview: false,
  promptVersion: 'test-1',
  used: { jev: false, llm: false },
});

async function run(adapters: ReturnType<typeof fakeAdapter>[]): Promise<RunOutcome> {
  const out = await runPipeline({ trigger: 'manual', adapters, enrich, fresherCheck, retagLimit: 0 });
  if (!out) throw new Error('run was refused (another run active?)');
  runIds.push(out.runId);
  return out;
}

const names = `'${A}', '${B}'`;
async function cleanup() {
  await query(`DELETE FROM jobs WHERE primary_source IN (${names})`); // cascades job_sources, job_cities
  await query(`DELETE FROM job_sources WHERE source IN (${names})`);
  await query(`DELETE FROM raw_posts WHERE source IN (${names})`);
  await query(`DELETE FROM sources WHERE name IN (${names})`);
  if (runIds.length) {
    const ids = runIds.join(',');
    await query(`DELETE FROM raw_posts WHERE run_id IN (${ids})`);
    await query(`DELETE FROM llm_calls WHERE run_id IN (${ids})`);
    await query(`DELETE FROM pipeline_runs WHERE id IN (${ids})`);
  }
}

const jobRow = async (company: string) =>
  (await query<{ id: number; status: string; missed_runs: number; is_fresher: boolean }>(
    'SELECT id, status, missed_runs, is_fresher FROM jobs WHERE company = @company',
    { company },
  ))[0];

describe('pipeline (real DB, fake adapter)', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closePool();
  });

  it('first run: counts, dedupe, filters and stored rows add up', async () => {
    const out = await run([adapterA(twentyPosts), fakeAdapter({ name: B, raws: [raw(B, { sourceJobId: 'b1', company: 'Zzfake Bee', title: 'Support Intern', applyUrl: 'https://test-fake-b.example/b1' })] })]);
    const s = out.stats;
    expect(out.status).toBe('success');
    expect(s.perSource[A]).toMatchObject({ fetched: 20, normalized: 18, rejected: 2 });
    expect(s.fetched).toBe(21);
    expect(s.rejected).toBe(2);
    expect(s.notFresher).toBe(3);
    expect(s.duplicatesExact).toBe(2);
    expect(s.duplicatesFuzzy).toBe(2);
    expect(s.newJobs).toBe(12); // 11 from A + 1 from B
    expect(s.updatedJobs).toBe(0);
    expect(s.taggedByRules).toBe(12);
    expect(s.rejectedSample.join('\n')).toMatch(/filtered out/);

    const [counts] = await query<{ jobs: number; links: number; raws: number; cities: number; notFresher: number }>(
      `SELECT (SELECT COUNT(*) FROM jobs WHERE primary_source = @a) AS jobs,
              (SELECT COUNT(*) FROM job_sources WHERE source = @a) AS links,
              (SELECT COUNT(*) FROM raw_posts WHERE source = @a AND run_id = @run) AS raws,
              (SELECT COUNT(*) FROM job_cities jc JOIN jobs j ON j.id = jc.job_id WHERE j.primary_source = @a) AS cities,
              (SELECT COUNT(*) FROM jobs WHERE primary_source = @a AND is_fresher = 0) AS notFresher`,
      { a: A, run: out.runId },
    );
    expect(counts).toEqual({ jobs: 11, links: 14, raws: 20, cities: 11, notFresher: 1 });

    const [src] = await query<{ last_status: string; terms_status: string }>('SELECT last_status, terms_status FROM sources WHERE name = @a', { a: A });
    expect(src).toEqual({ last_status: 'ok', terms_status: 'allowed' });

    const [run1] = await query<{ status: string; stage: string | null; stats: string }>('SELECT status, stage, stats FROM pipeline_runs WHERE id = @id', { id: out.runId });
    expect(run1!.status).toBe('success');
    expect(run1!.stage).toBeNull();
    expect(JSON.parse(run1!.stats).newJobs).toBe(12);

    const [search] = await query<{ search_text: string; tagged_by: string; prompt_version: string }>(
      'SELECT search_text, tagged_by, prompt_version FROM jobs WHERE company = @c',
      { c: 'Zzfake Alpha' },
    );
    expect(search!.search_text).toBe('backend intern zzfake alpha software engineering pune python pune');
    expect(JSON.parse(search!.tagged_by)).toEqual({ roleCategory: 'rules' });
    expect(search!.prompt_version).toBe('test-1');
  });

  it('second identical run creates nothing new and only touches known jobs', async () => {
    const out = await run([adapterA(twentyPosts)]);
    expect(out.stats.newJobs).toBe(0);
    expect(out.stats.updatedJobs).toBe(11);
    expect(out.stats.taggedByRules).toBe(0); // no enrichment needed
    const [n] = await query<{ n: number }>('SELECT COUNT(*) AS n FROM jobs WHERE primary_source = @a', { a: A });
    expect(n!.n).toBe(11);
    const [l] = await query<{ n: number }>('SELECT COUNT(*) AS n FROM job_sources WHERE source = @a', { a: A });
    expect(l!.n).toBe(14);
  });

  it('expires a job after 3 missed runs, but never jobs of a source that errored', async () => {
    const withoutU9 = () => twentyPosts().filter((r) => r.sourceJobId !== 'u9');
    const failingB = fakeAdapter({
      name: B,
      raws: async () => {
        throw new Error('source down');
      },
    });
    const outs: RunOutcome[] = [];
    for (let i = 0; i < 3; i++) {
      outs.push(await run([adapterA(withoutU9), failingB]));
      const u9 = await jobRow('Zzfake Iota');
      expect([u9!.status, u9!.missed_runs]).toEqual(i < 2 ? ['active', i + 1] : ['expired', 3]);
    }
    expect(outs.map((o) => o.status)).toEqual(['partial', 'partial', 'partial']);
    expect(outs[0]!.stats.perSource[B]!.error).toBe('source down');
    expect(outs[2]!.stats.expiredJobs).toBe(1);

    const bee = await jobRow('Zzfake Bee');
    expect(bee).toMatchObject({ status: 'active', missed_runs: 0 });
    const others = await jobRow('Zzfake Alpha');
    expect(others).toMatchObject({ status: 'active', missed_runs: 0 });
  });

  it('does not age jobs when a source returns an empty successful fetch', async () => {
    const before = await jobRow('Zzfake Alpha');
    const out = await run([adapterA(() => [])]);
    expect(out.stats.expiredJobs).toBe(0);
    expect(await jobRow('Zzfake Alpha')).toMatchObject({ status: 'active', missed_runs: before!.missed_runs });
  });

  it('reactivates an expired job when its source lists it again', async () => {
    const out = await run([adapterA(twentyPosts)]);
    expect(out.status).toBe('success');
    expect(await jobRow('Zzfake Iota')).toMatchObject({ status: 'active', missed_runs: 0 });
  });

  it('skips forbidden and disabled sources and records why', async () => {
    const forbidden = fakeAdapter({ name: B, meta: { termsStatus: 'forbidden' }, raws: [raw(B, { sourceJobId: 'x' })] });
    const out = await run([forbidden]);
    expect(out.stats.perSource[B]).toMatchObject({ fetched: 0, skipped: expect.stringMatching(/forbidden/) });
    expect(out.status).toBe('success');
    await query("UPDATE sources SET enabled = 0 WHERE name = @a", { a: A });
    const disabled = await run([adapterA(twentyPosts)]);
    expect(disabled.stats.perSource[A]!.skipped).toMatch(/disabled/);
    expect(disabled.stats.fetched).toBe(0);
  });

  it('refuses to start while another run is active', async () => {
    const [{ id }] = await query<{ id: number }>("INSERT INTO pipeline_runs (trigger_type, status) OUTPUT inserted.id VALUES ('manual', 'running')");
    runIds.push(Number(id));
    expect(await runPipeline({ trigger: 'cron', adapters: [], enrich, fresherCheck })).toBeNull();
    await query("UPDATE pipeline_runs SET status = 'failed' WHERE id = @id", { id });
  });
});

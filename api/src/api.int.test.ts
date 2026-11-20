// Integration test against the real local SQL Server. Inserts rows under the source 'test_api' and removes them afterwards.
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, exec, query } from '@beep/shared';
import { createApp } from './app.ts';

const SRC = 'test_api';
const MARK = 'zzapitest';
let server: Server;
let base = '';
let runId = 0;
const jobIds: number[] = [];

const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, body: (await res.json()) as any };
};

async function insertJob(j: {
  title: string;
  company: string;
  city?: string;
  role: string;
  jobType: string;
  workMode: string;
  stipend?: [number, number];
  status?: string;
  fresher?: boolean;
  postedDaysAgo?: number | null;
  description?: string;
}) {
  const rows = await query<{ id: number }>(
    `INSERT INTO jobs (title, company, company_norm, title_norm, description, apply_url, url_hash, location_raw, posted_at, primary_source,
        role_category, job_type, work_mode, is_fresher, stipend_min_monthly_inr, stipend_max_monthly_inr, skills, status, search_text, tagged_by)
     OUTPUT INSERTED.id
     VALUES (@title, @company, @company, @title, @description, @url, @hash, @loc, ${j.postedDaysAgo == null ? 'NULL' : 'DATEADD(day, -@posted, SYSUTCDATETIME())'},
        @src, @role, @jobType, @workMode, @fresher, @smin, @smax, '["python","sql"]', @status, @search, '{"roleCategory":"rules"}')`,
    {
      title: j.title,
      company: j.company,
      description: j.description ?? `${j.title} at ${j.company}. Work on 100% real things_ with [brackets].`,
      url: `https://example.test/${MARK}/${j.title}`,
      hash: createHash('sha256').update(`${MARK}${j.title}`).digest('hex'),
      loc: j.city ?? 'Anywhere',
      posted: j.postedDaysAgo ?? 0,
      src: SRC,
      role: j.role,
      jobType: j.jobType,
      workMode: j.workMode,
      fresher: j.fresher === false ? 0 : 1,
      smin: j.stipend?.[0] ?? null,
      smax: j.stipend?.[1] ?? null,
      status: j.status ?? 'active',
      search: `${j.title} ${j.company} ${j.role} ${j.city ?? ''} python sql ${MARK}`.toLowerCase(),
    },
  );
  const id = Number(rows[0]!.id);
  jobIds.push(id);
  await exec(`INSERT INTO job_sources (job_id, source, source_job_id, apply_url) VALUES (@id, @src, @sjid, @url)`, {
    id,
    src: SRC,
    sjid: `${MARK}-${id}`,
    url: `https://example.test/${MARK}/${j.title}`,
  });
  if (j.city) {
    await exec(`INSERT INTO job_cities (job_id, city_id) SELECT @id, id FROM cities WHERE name = @city`, { id, city: j.city });
  }
  return id;
}

async function cleanup() {
  await exec(`DELETE FROM jobs WHERE primary_source = @src`, { src: SRC }); // cascades to job_sources, job_cities, accuracy_labels
  await exec(`DELETE FROM llm_calls WHERE model = @m`, { m: MARK });
  await exec(`DELETE FROM pipeline_runs WHERE error = @m`, { m: MARK });
  await exec(`DELETE FROM sources WHERE name = @src`, { src: SRC });
}

beforeAll(async () => {
  await cleanup();
  await exec(`INSERT INTO sources (name, description, terms_status, terms_notes, last_status) VALUES (@src, 'API test source', 'allowed', 'integration test', 'success')`, { src: SRC });

  await insertJob({ title: `Python Intern ${MARK}`, company: 'Acme', city: 'Pune', role: 'Software Engineering', jobType: 'internship', workMode: 'onsite', stipend: [20000, 30000], postedDaysAgo: 2 });
  await insertJob({ title: `Data Analyst Trainee ${MARK}`, company: 'Globex', role: 'Data / AI / ML', jobType: 'full_time', workMode: 'remote', postedDaysAgo: 40 });
  await insertJob({ title: `Ops Associate ${MARK}`, company: 'Initech', role: 'Operations / Supply Chain', jobType: 'full_time', workMode: 'onsite' });
  await insertJob({ title: `Expired Intern ${MARK}`, company: 'Hooli', city: 'Pune', role: 'Software Engineering', jobType: 'internship', workMode: 'onsite', status: 'expired' });
  await insertJob({ title: `Senior Dev ${MARK}`, company: 'Hooli', city: 'Pune', role: 'Software Engineering', jobType: 'full_time', workMode: 'onsite', fresher: false });

  // A finished run with a model call, so stats can compute cost per 1,000 posts.
  const run = await query<{ id: number }>(
    `INSERT INTO pipeline_runs (trigger_type, status, stage, finished_at, stats, error) OUTPUT INSERTED.id
     VALUES ('manual', 'success', 'done', SYSUTCDATETIME(), @stats, @m)`,
    { stats: JSON.stringify({ newJobs: 3, perSource: { [SRC]: { fetched: 5, normalized: 5, rejected: 0, ms: 10 } } }), m: MARK },
  );
  runId = Number(run[0]!.id);
  await exec(
    `INSERT INTO llm_calls (run_id, job_id, purpose, provider, model, input_tokens, output_tokens, cost_usd, success)
     VALUES (@run, @job, 'tag_jev', 'jev', @m, 1000, 0, 0.003, 1)`,
    { run: runId, job: jobIds[0], m: MARK },
  );

  server = createApp({ quiet: true, adminToken: '' }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30_000);

afterAll(async () => {
  await new Promise((r) => server?.close(r));
  await cleanup();
  await closePool();
}, 30_000);

describe('GET /jobs', () => {
  it('returns only active fresher jobs of the test source with the documented item shape', async () => {
    const r = await get(`/jobs?source=${SRC}`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(r.body).toMatchObject({ page: 1, pageSize: 25 });
    const titles = r.body.items.map((i: any) => i.title);
    expect(titles.some((t: string) => t.startsWith('Expired'))).toBe(false);
    expect(titles.some((t: string) => t.startsWith('Senior'))).toBe(false);

    const pune = r.body.items.find((i: any) => i.title.startsWith('Python Intern'));
    expect(pune).toMatchObject({
      company: 'Acme',
      cities: ['Pune'],
      roleCategory: 'Software Engineering',
      jobType: 'internship',
      workMode: 'onsite',
      stipendMinMonthlyInr: 20000,
      stipendMaxMonthlyInr: 30000,
      skills: ['python', 'sql'],
      isNew: true,
    });
    expect(pune.sources).toEqual([{ source: SRC, applyUrl: `https://example.test/${MARK}/${pune.title}` }]);
    expect(pune.snippet.length).toBeLessThanOrEqual(240);
    expect(new Date(pune.postedAt).getTime()).toBeLessThan(Date.now() - 24 * 3600 * 1000);
  });

  it('sorts newest first by default (posted date, falling back to first seen)', async () => {
    const r = await get(`/jobs?source=${SRC}`);
    expect(r.body.items.map((i: any) => i.title.split(' ')[0])).toEqual(['Ops', 'Python', 'Data']);
  });

  it('filters by q tokens (all must match), city, remote, job type, stipend and age', async () => {
    expect((await get(`/jobs?q=${MARK}+intern&source=${SRC}`)).body.total).toBe(1);
    expect((await get(`/jobs?q=${MARK}+nonexistentword&source=${SRC}`)).body.total).toBe(0);
    expect((await get(`/jobs?source=${SRC}&city=Pune`)).body.total).toBe(1);
    expect((await get(`/jobs?source=${SRC}&city=Remote`)).body.items.map((i: any) => i.company)).toEqual(['Globex']);
    expect((await get(`/jobs?source=${SRC}&jobType=internship`)).body.total).toBe(1);
    expect((await get(`/jobs?source=${SRC}&stipendMin=25000`)).body.total).toBe(1);
    expect((await get(`/jobs?source=${SRC}&stipendMin=50000`)).body.total).toBe(0);
    expect((await get(`/jobs?source=${SRC}&postedWithinDays=7`)).body.total).toBe(2); // Data job posted 40 days ago drops out
    expect((await get(`/jobs?source=${SRC}&isNew=true`)).body.total).toBe(3);
    expect((await get(`/jobs?source=${SRC}&role=${encodeURIComponent('Data / AI / ML')}`)).body.total).toBe(1);
  });

  it('treats % _ [ ] ; and quotes in q as literal text, never as SQL or wildcards', async () => {
    for (const q of ['%', '_', '[', ']', '[a-z]', "'; DROP TABLE jobs; --", "' OR 1=1 --", '100%_']) {
      const r = await get(`/jobs?source=${SRC}&q=${encodeURIComponent(q)}`);
      expect(r.status, q).toBe(200);
      expect(r.body.total, q).toBe(0);
    }
    expect((await get(`/jobs?source=${SRC}`)).body.total).toBe(3); // table still intact
  });

  it('paginates', async () => {
    const r = await get(`/jobs?source=${SRC}&pageSize=2&page=2`);
    expect(r.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(r.body.items).toHaveLength(1);
  });

  it('ranks title hits first for sort=relevance', async () => {
    const r = await get(`/jobs?source=${SRC}&q=acme&sort=relevance`);
    expect(r.body.items[0].company).toBe('Acme');
  });
});

describe('GET /jobs/:id', () => {
  it('returns the full job, including expired ones, and 404 for unknown ids', async () => {
    const r = await get(`/jobs/${jobIds[0]}`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: jobIds[0], needsReview: false, taggedBy: { roleCategory: 'rules' }, status: 'active' });
    expect(r.body.description).toContain('real things_');
    expect((await get(`/jobs/${jobIds[3]}`)).body.status).toBe('expired');
    expect((await get('/jobs/999999999')).status).toBe(404);
  });
});

describe('GET /cities/summary', () => {
  it('counts per city, remote and unlocated with the same filters', async () => {
    const r = await get(`/cities/summary?source=${SRC}`);
    expect(r.status).toBe(200);
    expect(r.body.cities).toHaveLength(1);
    expect(r.body.cities[0]).toMatchObject({ city: 'Pune', state: 'Maharashtra', count: 1, topRoles: [{ role: 'Software Engineering', count: 1 }] });
    expect(typeof r.body.cities[0].lat).toBe('number');
    expect(r.body.remote).toEqual({ count: 1, topRoles: [{ role: 'Data / AI / ML', count: 1 }] });
    expect(r.body.unlocated).toEqual({ count: 1 });
  });

  it('applies filters', async () => {
    const r = await get(`/cities/summary?source=${SRC}&jobType=internship`);
    expect(r.body.cities.map((c: any) => c.city)).toEqual(['Pune']);
    expect(r.body.remote.count).toBe(0);
    expect(r.body.unlocated.count).toBe(0);
  });
});

describe('GET /filters/options', () => {
  it('lists roles, cities, job types, work modes, sources and posted ranges with counts', async () => {
    const r = await get('/filters/options');
    expect(r.status).toBe(200);
    expect(r.body.roles.find((x: any) => x.role === 'Software Engineering').count).toBeGreaterThanOrEqual(1);
    expect(r.body.cities.find((x: any) => x.city === 'Pune').count).toBeGreaterThanOrEqual(1);
    expect(r.body.sources.find((x: any) => x.source === SRC).count).toBe(3);
    expect(r.body.jobTypes.map((x: any) => x.value)).toEqual(['internship', 'full_time', 'apprenticeship', 'contract']);
    expect(r.body.workModes.map((x: any) => x.value)).toEqual(['onsite', 'hybrid', 'remote']);
    expect(r.body.postedRanges.map((x: any) => x.days)).toEqual([1, 7, 30]);
  });
});

describe('GET /stats', () => {
  it('reports totals, per-source status, llm usage and cost per 1,000 posts', async () => {
    const r = await get('/stats');
    expect(r.status).toBe(200);
    expect(r.body.totals.activeJobs).toBeGreaterThanOrEqual(3);
    expect(r.body.totals.bySource.find((x: any) => x.source === SRC).count).toBe(3);
    const src = r.body.sources.find((x: any) => x.name === SRC);
    expect(src).toMatchObject({ termsStatus: 'allowed', termsNotes: 'integration test', lastStatus: 'success', activeJobs: 3 });
    expect(r.body.recentRuns.some((x: any) => x.id === runId)).toBe(true);
    expect(r.body.lastRun).toMatchObject({ status: expect.any(String) });
    const usage = r.body.llmUsage.byModel.find((x: any) => x.model === MARK);
    expect(usage).toMatchObject({ provider: 'jev', purpose: 'tag_jev', calls: 1, inputTokens: 1000, costUsd: 0.003 });
    expect(r.body.costPer1000.tagging.postsTagged).toBeGreaterThanOrEqual(3);
    expect(r.body.costPer1000.tagging.per1000Posts).toBeGreaterThan(0);
    expect(r.body.accuracy.fields).toHaveProperty('role_category');
  });
});

describe('pipeline runs', () => {
  it('lists runs, returns one by id, and answers 409 while a run is active', async () => {
    const list = await get('/pipeline/runs?limit=5');
    expect(list.status).toBe(200);
    const one = await get(`/pipeline/runs/${runId}`);
    expect(one.body).toMatchObject({ id: runId, status: 'success', stage: 'done' });
    expect(one.body.stats.newJobs).toBe(3);
    expect((await get('/pipeline/runs/999999999')).status).toBe(404);

    // A running row blocks POST /pipeline/run with 409; it is finished again straight away.
    const active = await query<{ id: number }>(`INSERT INTO pipeline_runs (trigger_type, status, error) OUTPUT INSERTED.id VALUES ('manual', 'running', @m)`, { m: MARK });
    try {
      const res = await fetch(`${base}/pipeline/run`, { method: 'POST' });
      const body = (await res.json()) as any;
      expect(res.status).toBe(409);
      expect(body.error.code).toBe('RUN_ACTIVE');
      expect(typeof body.runId).toBe('number');
    } finally {
      await exec(`UPDATE pipeline_runs SET status = 'success', finished_at = SYSUTCDATETIME() WHERE id = @id`, { id: active[0]!.id });
    }
  });
});

describe('accuracy tooling', () => {
  it('samples, saves labels and summarises them', async () => {
    const sample = await get('/accuracy/sample?size=200');
    expect(sample.status).toBe(200);
    expect(sample.body.items.length).toBeGreaterThan(0);
    const mine = sample.body.items.find((i: any) => i.primarySource === SRC);
    expect(mine.predicted).toHaveProperty('role_category');
    expect(mine).toHaveProperty('descriptionExcerpt');

    const put = await fetch(`${base}/accuracy/labels`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        labels: [
          { jobId: jobIds[0], field: 'role_category', predicted: 'Software Engineering', correct: true },
          { jobId: jobIds[0], field: 'cities', predicted: 'Pune', correct: false, correctValue: 'Mumbai' },
        ],
      }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as any).upserted).toBe(2);

    const unknown = await fetch(`${base}/accuracy/labels`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ labels: [{ jobId: 999999999, field: 'job_type', correct: true }] }),
    });
    expect(unknown.status).toBe(400);

    const summary = await get('/accuracy/summary');
    expect(summary.body.fields.role_category.total).toBeGreaterThanOrEqual(1);
    expect(summary.body.fields.cities.correct).toBeLessThan(summary.body.fields.cities.total);
    expect(summary.body.overall.total).toBeGreaterThanOrEqual(2);
  });
});

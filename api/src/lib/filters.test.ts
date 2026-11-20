import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { allocateQuotas } from './accuracy.ts';
import { buildJobWhere, buildOrderBy, escapeLike, parseJobsQuery, searchTokens } from './filters.ts';

describe('parseJobsQuery', () => {
  it('applies defaults', () => {
    const r = parseJobsQuery({});
    expect(r).toMatchObject({ page: 1, pageSize: 25, sort: 'newest', filters: {} });
  });

  it('maps query params to filters and keeps repeated city values', () => {
    const r = parseJobsQuery({
      q: 'python intern',
      role: 'Data / AI / ML',
      city: ['Pune', 'Mumbai'],
      jobType: 'internship',
      workMode: 'remote',
      stipendMin: '10000',
      postedWithinDays: '7',
      source: 'greenhouse',
      isNew: 'true',
      page: '3',
      pageSize: '50',
      sort: 'relevance',
    });
    expect(r.filters).toEqual({
      q: 'python intern',
      roleCategory: 'Data / AI / ML',
      cities: ['Pune', 'Mumbai'],
      jobType: 'internship',
      workMode: 'remote',
      stipendMin: 10000,
      postedWithinDays: 7,
      source: 'greenhouse',
      isNew: true,
    });
    expect([r.page, r.pageSize, r.sort]).toEqual([3, 50, 'relevance']);
  });

  it('wraps a single city in an array and ignores blank params', () => {
    const r = parseJobsQuery({ city: 'Pune', q: '', jobType: '' });
    expect(r.filters.cities).toEqual(['Pune']);
    expect(r.filters.q).toBeUndefined();
    expect(r.filters.jobType).toBeUndefined();
  });

  it.each([
    [{ pageSize: '101' }],
    [{ pageSize: '0' }],
    [{ page: '0' }],
    [{ jobType: 'gig' }],
    [{ role: 'Wizard' }],
    [{ sort: 'random' }],
    [{ stipendMin: 'lots' }],
    [{ isNew: 'maybe' }],
  ])('rejects invalid input %j', (raw) => {
    expect(() => parseJobsQuery(raw)).toThrow(ZodError);
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and brackets', () => {
    expect(escapeLike('100%_[a]\\')).toBe('100\\%\\_\\[a\\]\\\\');
  });
});

describe('searchTokens', () => {
  it('splits on whitespace, lowercases, dedupes and merges keywords', () => {
    expect(searchTokens({ q: '  Python   INTERN python ', keywords: ['pune'] })).toEqual(['python', 'intern', 'pune']);
  });
  it('caps token count and length', () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(searchTokens({ q: many })).toHaveLength(10);
    expect(searchTokens({ q: 'x'.repeat(500) })[0]).toHaveLength(80);
  });
});

describe('buildJobWhere', () => {
  it('always restricts to active fresher jobs', () => {
    const { where, params } = buildJobWhere({});
    expect(where).toBe("j.status = 'active' AND j.is_fresher = 1");
    expect(params).toEqual({});
  });

  it('requires every token via parameterised LIKE', () => {
    const { where, params } = buildJobWhere({ q: 'python pune' });
    expect(where).toContain("j.search_text LIKE @q0 ESCAPE '\\'");
    expect(where).toContain("j.search_text LIKE @q1 ESCAPE '\\'");
    expect(params).toMatchObject({ q0: '%python%', q1: '%pune%' });
  });

  it('never puts user text into the SQL string (injection attempts)', () => {
    const evil = ["'; DROP TABLE jobs; --", '" OR 1=1 --', '[a-z]%', "x' UNION SELECT * FROM app_settings --"];
    const { where, params } = buildJobWhere({
      q: evil.join(' '),
      cities: ["Pune'; DROP TABLE cities;--"],
      source: "a' OR '1'='1",
    });
    expect(where).not.toMatch(/DROP|UNION|OR 1=1|app_settings|1'='1/i);
    expect(Object.values(params).join('|')).toContain('DROP');
    // a bracket and a percent sign in a token are escaped, so they match literally
    const i = searchTokens({ q: evil.join(' ') }).indexOf('[a-z]%');
    expect(params[`q${i}`]).toBe('%\\[a-z\\]\\%%');
  });

  it('escapes % _ [ ] in the token value', () => {
    const { params } = buildJobWhere({ q: '100%_[x]' });
    expect(params.q0).toBe('%100\\%\\_\\[x\\]%');
  });

  it('builds a city filter, treating Remote as a work mode', () => {
    const a = buildJobWhere({ cities: ['Pune', 'Mumbai'] });
    expect(a.where).toContain('c.name IN (@city0, @city1)');
    expect(a.params).toMatchObject({ city0: 'Pune', city1: 'Mumbai' });

    const b = buildJobWhere({ cities: ['Pune', 'Remote'] });
    expect(b.where).toContain("AND c.name IN (@city0)) OR j.work_mode = 'remote')");

    const c = buildJobWhere({ cities: ['remote'] });
    expect(c.where).toContain("(j.work_mode = 'remote')");
    expect(c.params).toEqual({});
  });

  it('adds scalar filters as parameters', () => {
    const { where, params } = buildJobWhere({
      roleCategory: 'Marketing',
      jobType: 'internship',
      workMode: 'hybrid',
      stipendMin: 1,
      postedWithinDays: 7,
      source: 'lever',
      isNew: true,
    });
    expect(where).toContain('j.role_category = @role');
    expect(where).toContain('j.job_type = @jobType');
    expect(where).toContain('j.work_mode = @workMode');
    expect(where).toContain('>= @stipendMin');
    expect(where).toContain('DATEADD(day, -@postedDays');
    expect(where).toContain('j.primary_source = @source');
    expect(where).toContain('DATEADD(hour, -24');
    expect(params).toEqual({ role: 'Marketing', jobType: 'internship', workMode: 'hybrid', stipendMin: 1, postedDays: 7, source: 'lever' });
  });

  it('honours the table alias', () => {
    expect(buildJobWhere({ jobType: 'internship' }, 'x').where).toContain('x.job_type = @jobType');
  });
});

describe('buildOrderBy', () => {
  it('sorts newest by default and for relevance without tokens', () => {
    expect(buildOrderBy('newest', ['a'])).toMatch(/^COALESCE\(j\.posted_at/);
    expect(buildOrderBy('relevance', [])).toMatch(/^COALESCE\(j\.posted_at/);
  });
  it('scores title and company hits for relevance', () => {
    const o = buildOrderBy('relevance', ['a', 'b']);
    expect(o).toContain('j.title LIKE @q0');
    expect(o).toContain('j.company LIKE @q1');
    expect(o).toContain('DESC, COALESCE(');
  });
});

describe('allocateQuotas', () => {
  it('is proportional, gives each source at least one, and sums to the size', () => {
    const q = allocateQuotas({ a: 800, b: 150, c: 40, d: 10 }, 50);
    expect(Object.values(q).reduce((n, v) => n + v, 0)).toBe(50);
    expect(Object.values(q).every((v) => v >= 1)).toBe(true);
    expect(q.a).toBeGreaterThan(q.b!);
  });
  it('never exceeds what a source has and handles small pools', () => {
    expect(allocateQuotas({ a: 3, b: 2 }, 50)).toEqual({ a: 3, b: 2 });
    expect(allocateQuotas({}, 50)).toEqual({});
  });
});

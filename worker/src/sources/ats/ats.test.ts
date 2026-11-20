import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JobPostSchema } from '@beep/shared';
import type { RawPost } from '@beep/shared';
import { describe, expect, it } from 'vitest';
import atsAdapters from '../ats.ts';
import { ashby } from './ashby.ts';
import { greenhouse } from './greenhouse.ts';
import { isIndiaLocation, isSeniorTitle } from './india.ts';
import { lever } from './lever.ts';
import { createAtsAdapter, loadCompanies } from './make-adapter.ts';
import type { AtsPayload, Company, PlatformDef } from './types.ts';
import { workable } from './workable.ts';

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8')) as T;

function run(def: PlatformDef, company: Company, jobs: unknown[]) {
  const adapter = createAtsAdapter(def, [company]);
  return jobs.map((job) => {
    const raw: RawPost = {
      source: def.platform,
      sourceJobId: 'x',
      payload: { company: { slug: company.slug, name: company.name }, job } satisfies AtsPayload,
    };
    return adapter.normalize(raw);
  });
}

describe('india location rules', () => {
  it('accepts India, gazetteer cities and APAC/India remote', () => {
    for (const t of ['Bangalore, India', 'Pune, Maharashtra', 'Remote - India', 'India (Remote)', 'Remote, APAC', 'Hyderabad']) {
      expect(isIndiaLocation(t), t).toBe(true);
    }
  });
  it('rejects other countries and bare remote', () => {
    for (const t of ['Remote', 'New York City', 'Singapore', 'Salem, Oregon', 'Hyderabad, Pakistan', 'Kota Kinabalu, Sabah, Malaysia', 'Dublin', '']) {
      expect(isIndiaLocation(t), t).toBe(false);
    }
  });
  it('drops clearly senior titles but keeps interns', () => {
    expect(isSeniorTitle('Senior Android Engineer')).toBe(true);
    expect(isSeniorTitle('Sr. Recruiter')).toBe(true);
    expect(isSeniorTitle('VP Product Marketing')).toBe(true);
    expect(isSeniorTitle('Staff Software Engineer')).toBe(true);
    expect(isSeniorTitle('Product Manager Intern')).toBe(false);
    expect(isSeniorTitle('Associate Data Scientist')).toBe(false);
    expect(isSeniorTitle('Staffing Coordinator')).toBe(false);
  });
});

describe('greenhouse', () => {
  const { jobs } = fixture<{ jobs: unknown[] }>('greenhouse-mongodb.json');
  const co = { platform: 'greenhouse', slug: 'mongodb', name: 'MongoDB' } as const;
  const [junior, senior, abroad] = run(greenhouse, co, jobs);

  it('maps an India posting', () => {
    expect(JobPostSchema.safeParse(junior).success).toBe(true);
    expect(junior).toMatchObject({
      source: 'greenhouse',
      title: 'Account Development Representative',
      company: 'MongoDB',
      locationRaw: 'Bengaluru',
    });
    expect(junior!.sourceJobId).toMatch(/^mongodb:\d+$/);
    expect(junior!.applyUrl).toMatch(/^https:\/\//);
    expect(junior!.postedAt).toBeInstanceOf(Date);
    expect(junior!.description.length).toBeGreaterThan(50);
    expect(junior!.description.length).toBeLessThanOrEqual(6000);
    expect(junior!.description).not.toMatch(/&lt;|<p>/); // escaped HTML was decoded and stripped
  });
  it('drops senior titles and non-India postings', () => {
    expect(senior).toBeNull();
    expect(abroad).toBeNull();
  });
  it('keeps every India location of a multi-city posting', () => {
    const multi = (jobs[1] as { location: { name: string } }).location.name;
    expect(multi).toContain(';');
    const p = run(greenhouse, co, [{ ...(jobs[1] as object), title: 'Digital Success Associate' }])[0]!;
    expect(p.locationRaw).toContain('Bengaluru');
  });
});

describe('lever', () => {
  const jobs = fixture<unknown[]>('lever-hevodata.json');
  const co = { platform: 'lever', slug: 'hevodata', name: 'Hevo Data' } as const;
  const [intern, cityOnly, senior, abroad] = run(lever, co, jobs);

  it('maps an India internship', () => {
    expect(JobPostSchema.safeParse(intern).success).toBe(true);
    expect(intern).toMatchObject({
      source: 'lever',
      title: 'Associate Software Development Engineer (SDE) Intern',
      company: 'Hevo Data',
      locationRaw: 'Bangalore, India',
      employmentTypeRaw: 'Full time',
    });
    expect(intern!.sourceJobId).toMatch(/^hevodata:[0-9a-f-]{36}$/);
    expect(intern!.applyUrl).toMatch(/^https:\/\/jobs\.lever\.co\//);
    expect(intern!.postedAt).toBeInstanceOf(Date);
    expect(intern!.description).toContain('Associate SDE');
  });
  it('accepts a city-only location using the platform country code', () => {
    expect(cityOnly?.locationRaw).toBe('Pune, Maharashtra');
  });
  it('rejects senior and non-India postings', () => {
    expect(senior).toBeNull();
    expect(abroad).toBeNull();
  });
  it('reads salary ranges', () => {
    const p = run(lever, co, [{ ...(jobs[0] as object), salaryRange: { currency: 'INR', interval: 'per-year-salary', min: 500000, max: 900000 } }])[0]!;
    expect(p.compensationRaw).toBe('INR 500000-900000 per-year-salary');
  });
});

describe('ashby', () => {
  const { jobs } = fixture<{ jobs: unknown[] }>('ashby-bureau.json');
  const co = { platform: 'ashby', slug: 'bureau', name: 'Bureau' } as const;
  const [junior, senior, , seniorPm] = run(ashby, co, jobs);

  it('maps an India posting', () => {
    expect(JobPostSchema.safeParse(junior).success).toBe(true);
    expect(junior).toMatchObject({
      source: 'ashby',
      title: 'Associate Data Scientist',
      company: 'Bureau',
      locationRaw: 'Bangalore',
      employmentTypeRaw: 'FullTime',
    });
    expect(junior!.sourceJobId).toMatch(/^bureau:[0-9a-f-]{36}$/);
    expect(junior!.applyUrl).toMatch(/^https:\/\/jobs\.ashbyhq\.com\/bureau\//);
    expect(junior!.postedAt).toBeInstanceOf(Date);
    expect(junior!.description).toContain('Bureau');
  });
  it('drops senior titles', () => {
    expect(senior).toBeNull();
    expect(seniorPm).toBeNull();
  });
  it('drops non-India and unlisted postings, keeps remote-India', () => {
    const base = jobs[0] as Record<string, unknown>;
    const away = { ...base, location: 'Southeast Asia', secondaryLocations: [], address: { postalAddress: { addressCountry: 'Vietnam' } } };
    expect(run(ashby, co, [away])[0]).toBeNull();
    expect(run(ashby, co, [{ ...base, isListed: false }])[0]).toBeNull();
    const remote = { ...base, location: 'Remote - India', address: undefined };
    expect(run(ashby, co, [remote])[0]?.locationRaw).toBe('Remote - India');
  });
  it('uses the compensation summary when present', () => {
    const p = run(ashby, co, [{ ...(jobs[0] as object), compensation: { compensationTierSummary: 'INR 8L - 12L' } }])[0]!;
    expect(p.compensationRaw).toBe('INR 8L - 12L');
  });
});

describe('workable', () => {
  const jobs = fixture<unknown[]>('workable-widget.json');
  const co = { platform: 'workable', slug: 'acme', name: 'Acme' } as const;
  const results = run(workable, co, jobs);

  it('maps India postings and drops the rest', () => {
    const kept = results.filter((r) => r);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(jobs.length);
    for (const p of kept) {
      expect(JobPostSchema.safeParse(p).success).toBe(true);
      expect(p!.source).toBe('workable');
      expect(p!.sourceJobId).toMatch(/^acme:/);
      expect(p!.applyUrl).toMatch(/^https:\/\/apply\.workable\.com\//);
    }
  });
});

describe('adapters', () => {
  it('expose unique names and honest meta', () => {
    const names = atsAdapters.map((a) => a.name);
    expect(names).toEqual(['greenhouse', 'lever', 'ashby', 'workable']);
    for (const a of atsAdapters) {
      expect(a.meta.accessMethod).toBe('public_ats_api');
      expect(a.meta.termsNotes).toContain('2026-11-18');
      expect(['allowed', 'allowed_with_limits']).toContain(a.meta.termsStatus);
    }
  });
  it('ships a verified company list per platform with unique slugs', () => {
    const all = loadCompanies();
    expect(all.length).toBeGreaterThanOrEqual(250);
    expect(new Set(all.map((c) => `${c.platform}/${c.slug}`)).size).toBe(all.length);
    for (const p of ['greenhouse', 'lever', 'ashby']) expect(loadCompanies(p as Company['platform']).length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { CitySummary, JobDetail, SourceStatus, Stats } from '../../api/types.ts';
import {
  allowedSourceCount,
  beaconRadius,
  buildReadingList,
  cityBars,
  formatIst,
  formatStipendLong,
  formatStipendShort,
  labelledCities,
  marqueeItems,
  qualityLine,
  SKIPPED_SITES,
  sourcesWithJobs,
  taggingRows,
} from './format.ts';

const src = (name: string, activeJobs: number, over: Partial<SourceStatus> = {}): SourceStatus => ({
  name,
  description: null,
  homepage: null,
  accessMethod: 'feed',
  termsUrl: null,
  termsStatus: 'allowed_with_limits',
  termsNotes: null,
  robotsCheckedAt: null,
  enabled: true,
  lastRunAt: null,
  lastStatus: null,
  activeJobs,
  lastRun: null,
  ...over,
});

const city = (c: string, count: number): CitySummary => ({ city: c, state: '', lat: 0, lng: 0, count, topRoles: [] });

describe('formatIst', () => {
  it('formats an instant in Indian Standard Time', () => {
    expect(formatIst('2026-11-19T00:53:43.774Z')).toEqual({ date: '19 Nov', time: '06:23' });
  });
  it('rolls over midnight UTC into the next IST day', () => {
    expect(formatIst('2026-11-18T19:00:00Z')).toEqual({ date: '19 Nov', time: '00:30' });
  });
  it('returns null for missing or invalid input', () => {
    expect(formatIst(null)).toBeNull();
    expect(formatIst('nope')).toBeNull();
  });
});

describe('stipend formatting', () => {
  it('short form', () => {
    expect(formatStipendShort(1000, 1500)).toBe('₹1,000–1,500/mo');
    expect(formatStipendShort(5000, 5000)).toBe('₹5,000/mo');
    expect(formatStipendShort(null, null)).toBeNull();
  });
  it('long form', () => {
    expect(formatStipendLong(5000, 15000)).toBe('₹5,000 to ₹15,000 a month');
    expect(formatStipendLong(20000, null)).toBe('₹20,000 a month');
    expect(formatStipendLong(0, 0)).toBeNull();
  });
});

describe('reading list', () => {
  const sources = [
    src('lever', 61),
    src('unstop', 285),
    src('workable', 95),
    src('freshersvoice', 74),
    src('greenhouse', 43),
    src('adzuna', 0),
    src('careerjet', 0, { termsStatus: 'unclear' }),
    src('forbidden-one', 50, { termsStatus: 'forbidden' }),
  ];
  it('names the top three and folds the rest into one row that sums their jobs', () => {
    const rows = buildReadingList(sources);
    expect(rows.map((r) => r.name)).toEqual(['Unstop', 'Workable', 'FreshersVoice', '2 more sources']);
    expect(rows.map((r) => r.count)).toEqual([285, 95, 74, 104]);
    expect(rows[0].pct).toBe(100);
    expect(rows[3].detail).toBe('Lever, Greenhouse');
  });
  it('never lists sources whose terms are not allowed, or that have no jobs', () => {
    const names = buildReadingList(sources).flatMap((r) => [r.name, r.detail]).join(' ');
    expect(names).not.toMatch(/forbidden|Adzuna|careerjet/i);
  });
  it('has no "more" row when three or fewer sources have jobs', () => {
    expect(buildReadingList([src('unstop', 10), src('lever', 5)]).map((r) => r.key)).toEqual(['unstop', 'lever']);
    expect(buildReadingList([])).toEqual([]);
  });
  it('counts allowed sources and sources with jobs', () => {
    expect(allowedSourceCount(sources)).toBe(6);
    expect(sourcesWithJobs(sources)).toBe(6);
  });
});

describe('skipped sites', () => {
  it('lists the five refused sites from docs/SOURCE_REVIEW.md with a reason each', () => {
    expect(SKIPPED_SITES.map((s) => s.name)).toEqual(['LinkedIn', 'Naukri', 'Indeed', 'Internshala', 'Glassdoor']);
    for (const s of SKIPPED_SITES) expect(s.reason.length).toBeGreaterThan(10);
  });
});

describe('cities', () => {
  const cities = [city('Pune', 20), city('Bengaluru', 133), city('Mumbai', 45), city('Hyderabad', 43), city('Chennai', 36), city('Noida', 36), city('Delhi', 34)];
  it('radius follows 4 + sqrt(count) * 1.6', () => {
    expect(beaconRadius(100)).toBeCloseTo(20);
    expect(beaconRadius(0)).toBe(2.5);
  });
  it('labels cities with 36+ jobs or the top four', () => {
    expect([...labelledCities(cities)].sort()).toEqual(['Bengaluru', 'Chennai', 'Hyderabad', 'Mumbai', 'Noida']);
    expect([...labelledCities([city('A', 3), city('B', 2), city('C', 1), city('D', 1), city('E', 1)])].sort()).toEqual(['A', 'B', 'C', 'D']);
  });
  it('marquee is sorted by count and ends with Remote', () => {
    const items = marqueeItems(cities, 145, 3);
    expect(items).toEqual([
      { name: 'Bengaluru', count: 133 },
      { name: 'Mumbai', count: 45 },
      { name: 'Hyderabad', count: 43 },
      { name: 'Remote', count: 145 },
    ]);
    expect(marqueeItems(cities, 0, 1)).toEqual([{ name: 'Bengaluru', count: 133 }]);
  });
  it('bars are relative to the biggest city', () => {
    expect(cityBars([{ city: 'A', count: 50 }, { city: 'B', count: 133 }], 8)).toEqual([
      { city: 'B', count: 133, pct: 100 },
      { city: 'A', count: 50, pct: 38 },
    ]);
    expect(cityBars([], 8)).toEqual([]);
  });
});

describe('taggingRows', () => {
  const base: JobDetail = {
    id: 1,
    title: 'Business Development Internship',
    company: 'Cloud Print',
    cities: ['Pune'],
    locationRaw: 'Pune, Maharashtra',
    roleCategory: 'Sales / Business Development',
    jobType: 'internship',
    workMode: 'onsite',
    stipendMinMonthlyInr: 5000,
    stipendMaxMonthlyInr: 15000,
    skills: [],
    postedAt: null,
    firstSeenAt: '2026-11-19T00:00:00Z',
    isNew: true,
    sources: [],
    snippet: '',
    description: '',
    status: 'active',
    experienceMinYears: null,
    experienceMaxYears: null,
    needsReview: false,
    confidence: 0.7,
    taggedBy: { roleCategory: 'rules', jobType: 'rules', cities: 'rules', stipendMinMonthlyInr: 'rules' },
    promptVersion: 'rules',
    employmentTypeRaw: 'Internship part time',
    compensationRaw: 'INR 5000-15000 per month',
  };
  it('uses real values, raw text and taggedBy', () => {
    const rows = taggingRows(base);
    expect(rows.map((r) => r.value)).toEqual(['Pune', '₹5,000 to ₹15,000 a month', 'Internship', 'Sales / Business Development', 'None found in this post']);
    expect(rows[0].raw).toBe('Pune, Maharashtra');
    expect(rows[1].raw).toBe('INR 5000-15000 per month');
    expect(rows.map((r) => r.by)).toEqual(['rules', 'rules', 'rules', 'rules', 'none']);
  });
  it('shows what really tagged a field', () => {
    const rows = taggingRows({ ...base, skills: ['SEO'], taggedBy: { ...base.taggedBy!, roleCategory: 'jev', skills: 'llm' } });
    expect(rows[3].by).toBe('jev');
    expect(rows[4].by).toBe('llm');
  });
  it('does not claim AI tagging when the post still needs review and has no taggedBy', () => {
    const rows = taggingRows({ ...base, taggedBy: null, needsReview: true });
    expect(rows.map((r) => r.by)).toEqual(['rules', 'rules', 'rules', 'pending', 'pending']);
  });
});

describe('qualityLine', () => {
  const stats = (per1000: number | null, percent: number | null, labelled = 0) =>
    ({
      costPer1000: { tagging: per1000 == null ? null : { per1000Posts: per1000 }, search: null },
      accuracy: { labelledJobs: labelled, fields: {}, overall: { correct: 0, total: 0, percent } },
    }) as unknown as Stats;
  it('says "not measured yet" when there is no data', () => {
    expect(qualityLine(stats(null, null))).toBe('Cost per 1,000 posts tagged: not measured yet. Tagging accuracy on hand-checked posts: not measured yet.');
  });
  it('shows real values', () => {
    expect(qualityLine(stats(0.42, 91.6, 50))).toBe('Cost per 1,000 posts tagged: $0.420. Tagging accuracy on 50 hand-checked posts: 92%.');
  });
});

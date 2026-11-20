import { describe, expect, it } from 'vitest';
import type { JobFilters } from '@beep/shared';
import { buildChips, focusCityOf } from './chips.ts';
import { parseWithRules } from './rules.ts';

const CASES: [string, JobFilters][] = [
  ['python internships in pune with stipend', { keywords: ['python'], jobType: 'internship', cities: ['Pune'], stipendMin: 1 }],
  ['remote data analyst fresher jobs posted this week', { workMode: 'remote', roleCategory: 'Business / Data Analyst', postedWithinDays: 7 }],
  ['wfh content writing', { workMode: 'remote', roleCategory: 'Content / Writing' }],
  ['paid marketing internship in bangalore', { jobType: 'internship', cities: ['Bengaluru'], stipendMin: 1, roleCategory: 'Marketing' }],
  ['unpaid internships mumbai', { jobType: 'internship', cities: ['Mumbai'] }],
  ['java developer jobs in hyderabad', { keywords: ['java'], roleCategory: 'Software Engineering', cities: ['Hyderabad'] }],
  ['frontend developer remote', { workMode: 'remote', roleCategory: 'Software Engineering', keywords: ['frontend'] }],
  ['internships above 15000', { jobType: 'internship', stipendMin: 15000 }],
  ['stipend 10k internship noida', { jobType: 'internship', stipendMin: 10000, cities: ['Noida'] }],
  ['jobs in gurgaon', { cities: ['Gurugram'] }],
  ['sales executive fresher delhi ncr', { roleCategory: 'Sales / Business Development', keywords: ['executive'] }],
  ['ui ux designer internship pune', { roleCategory: 'UI / UX Design', jobType: 'internship', cities: ['Pune'] }],
  ['machine learning intern', { roleCategory: 'Data / AI / ML', jobType: 'internship' }],
  ['devops engineer chennai', { roleCategory: 'DevOps / Cloud', cities: ['Chennai'], keywords: ['engineer'] }],
  ['qa testing jobs jaipur', { roleCategory: 'QA / Testing', cities: ['Jaipur'] }],
  ['hr recruiter trainee kolkata', { roleCategory: 'HR / Recruiting', cities: ['Kolkata'], keywords: ['trainee'] }],
  ['customer support work from home', { roleCategory: 'Customer Support', workMode: 'remote' }],
  ['new jobs posted today', { postedWithinDays: 1 }],
  ['react internship last 30 days', { keywords: ['react'], jobType: 'internship', postedWithinDays: 30 }],
  ['hybrid software engineer ahmedabad', { workMode: 'hybrid', roleCategory: 'Software Engineering', cities: ['Ahmedabad'], keywords: ['engineer'] }],
  ['apprenticeship mechanical engineer pune', { jobType: 'apprenticeship', roleCategory: 'Core Engineering', cities: ['Pune'], keywords: ['engineer'] }],
  ['accounting jobs with salary', { roleCategory: 'Finance / Accounting', stipendMin: 1 }],
  ['full time cybersecurity analyst bengaluru', { jobType: 'full_time', roleCategory: 'Cybersecurity', cities: ['Bengaluru'] }],
  ['sql excel', { keywords: ['sql', 'excel'] }],
  ['mumbai or pune internship', { jobType: 'internship', cities: ['Mumbai', 'Pune'] }],
  ['at least 20k stipend remote internship', { stipendMin: 20000, workMode: 'remote', jobType: 'internship' }],
  ['content writer internship this month', { roleCategory: 'Content / Writing', jobType: 'internship', postedWithinDays: 30 }],
];

describe('rule parser: 27 representative queries', () => {
  it.each(CASES)('%s', (query, expected) => {
    const { filters } = parseWithRules(query);
    // Only the fields named in the expectation are compared, so extra harmless keywords do not make tests brittle.
    const actual: Record<string, unknown> = {};
    for (const k of Object.keys(expected)) actual[k] = (filters as Record<string, unknown>)[k];
    if ('keywords' in expected) {
      expect(new Set(filters.keywords)).toEqual(new Set(expected.keywords));
      delete actual.keywords;
      delete (expected as Record<string, unknown>).keywords;
    }
    if (expected.cities) {
      expect(new Set(filters.cities)).toEqual(new Set(expected.cities));
      delete actual.cities;
      delete (expected as Record<string, unknown>).cities;
    }
    expect(actual).toEqual(expected);
  });

  it('delhi ncr expands to the region', () => {
    expect(parseWithRules('sales delhi ncr').filters.cities).toEqual(expect.arrayContaining(['Delhi', 'Gurugram', 'Noida']));
  });

  it('does not treat unpaid as paid, years as pay, or fresher as a keyword', () => {
    expect(parseWithRules('unpaid internship').filters.stipendMin).toBeUndefined();
    expect(parseWithRules('batch 2025 graduates').filters.stipendMin).toBeUndefined();
    expect(parseWithRules('fresher jobs').filters).toEqual({});
  });

  it('survives junk input', () => {
    expect(parseWithRules('   ').filters).toEqual({});
    expect(parseWithRules('!!!???').filters).toEqual({});
    expect(() => parseWithRules('x'.repeat(5000))).not.toThrow();
  });
});

describe('chips', () => {
  it('builds one labelled chip per applied filter and a focus city', () => {
    const f = parseWithRules('paid python internship pune remote this week').filters;
    const chips = buildChips(f);
    expect(chips.map((c) => c.label)).toEqual(
      expect.arrayContaining(['python', 'Pune', 'Internship', 'Remote', 'With stipend', 'Posted this week']),
    );
    expect(chips.find((c) => c.field === 'cities')).toMatchObject({ label: 'Pune', value: 'Pune' });
    expect(focusCityOf(f)).toBe('Pune');
  });

  it('formats a numeric stipend and ignores Remote as a focus city', () => {
    expect(buildChips({ stipendMin: 15000 })[0]!.label).toBe('Stipend from ₹15,000/month');
    expect(focusCityOf({ cities: ['Remote', 'Pune'] })).toBe('Pune');
    expect(focusCityOf({})).toBeNull();
  });
});

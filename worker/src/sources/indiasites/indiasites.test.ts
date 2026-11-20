import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { JobPostSchema, type RawPost } from '@beep/shared';
import adapters from '../indiasites.ts';
import { isSeniorTitle, parseDate } from './common.ts';
import { citiesFrom, normalizeFreshersVoice, parsePosts, parseTitle, type FvPost } from './freshersvoice.ts';
import { normalizeUnstop, type UnstopItem } from './unstop.ts';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const decode = (s: string) => s.replace(/&#8211;/g, '–').replace(/&#038;/g, '&');
const raw = (source: string, payload: unknown, id = 'x'): RawPost => ({ source, sourceJobId: id, payload });

describe('indiasites registry export', () => {
  it('exports uniquely named adapters with honest terms metadata', () => {
    expect(new Set(adapters.map((a) => a.name)).size).toBe(adapters.length);
    for (const a of adapters) {
      expect(['allowed', 'allowed_with_limits']).toContain(a.meta.termsStatus);
      expect(a.meta.termsNotes).toMatch(/2026-11-18/);
      expect(a.meta.termsUrl).toMatch(/^https:/);
    }
  });
});

describe('common helpers', () => {
  it('parses Unstop and ISO dates', () => {
    expect(parseDate('2026-11-18 00:50:01 GMT+0530')?.toISOString()).toBe('2026-11-17T19:20:01.000Z');
    expect(parseDate('Tue, 17 Nov 2026 14:41:27 +0000')?.toISOString()).toBe('2026-11-17T14:41:27.000Z');
    expect(parseDate('nonsense')).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
  it('flags senior titles only', () => {
    expect(isSeniorTitle('Senior Backend Engineer')).toBe(true);
    expect(isSeniorTitle('Software Engineer Intern')).toBe(false);
    expect(isSeniorTitle('Growth / Lead Generation Internship')).toBe(false);
  });
});

describe('unstop normalize', () => {
  const data = JSON.parse(fixture('unstop.json')) as { internships: UnstopItem[]; jobs: UnstopItem[] };

  it('maps a paid internship with a city', () => {
    const post = normalizeUnstop(raw('unstop', data.internships[0]!))!;
    expect(JobPostSchema.safeParse(post).success).toBe(true);
    expect(post.sourceHint).toBe('internship');
    expect(post.applyUrl).toMatch(/^https:\/\/unstop\.com\/internships\//);
    expect(post.compensationRaw).toMatch(/^INR \d+(-\d+)? per month$/);
    expect(post.locationRaw).toContain('Ahmedabad');
    expect(post.description.length).toBeGreaterThan(20);
    expect(post.description).not.toMatch(/<[a-z]/i);
    expect(post.postedAt).toBeInstanceOf(Date);
  });

  it('treats an online internship without a location as remote India', () => {
    const post = normalizeUnstop(raw('unstop', data.internships[1]!))!;
    expect(post.locationRaw).toBe('Remote, India');
    expect(post.compensationRaw).toBe('Unpaid');
  });

  it('maps a job and gives annual pay per year', () => {
    const post = normalizeUnstop(raw('unstop', data.jobs[0]!))!;
    expect(post.employmentTypeRaw).toMatch(/^Job/);
    expect(post.compensationRaw).toBe('INR 600000-800000 per year');
    expect(post.sourceHint).toBe('none');
  });

  it('drops senior titles, non-India locations and closed posts', () => {
    expect(normalizeUnstop(raw('unstop', data.jobs[1]!))).toBeNull(); // "... Sales Manager"
    expect(normalizeUnstop(raw('unstop', data.jobs[2]!))).toBeNull(); // location edited to London to exercise the filter
    expect(normalizeUnstop(raw('unstop', { ...data.jobs[0]!, status: 'EXPIRED' }))).toBeNull();
  });

  it('sets fresher hint from the eligibility sector', () => {
    const item = { ...data.jobs[0]!, regnRequirements: { eligibility: JSON.stringify({ sector: ['fresher'] }) } };
    expect(normalizeUnstop(raw('unstop', item))!.sourceHint).toBe('fresher');
  });
});

describe('freshersvoice normalize', () => {
  const data = JSON.parse(fixture('freshersvoice.json')) as { categories: { id: number; name: string }[]; posts: FvPost[] };
  const items = parsePosts(data.posts, new Map(data.categories.map((c) => [c.id, c.name] as const)));
  const norm = (start: string) => normalizeFreshersVoice(raw('freshersvoice', items.find((i) => decode(i.title.rendered).startsWith(start))!))!;

  it('maps a recruitment post with city categories', () => {
    const post = norm('Apple Recruitment');
    expect(JobPostSchema.safeParse(post).success).toBe(true);
    expect(post.company).toBe('Apple');
    expect(post.title).toBe('Junior Fullstack Engineer – ETS');
    expect(post.locationRaw).toBe('Hyderabad');
    expect(post.sourceHint).toBe('fresher');
    expect(post.applyUrl).toBe('https://www.freshersvoice.com/apple-recruitment');
    expect(post.postedAt?.toISOString()).toBe('2026-11-18T05:35:09.000Z');
    expect(post.description).not.toMatch(/Read more|<[a-z]/i);
    expect(post.description).toMatch(/^Apple Recruitment 2026: Apple is scheduled/);
  });

  it('keeps several cities and drops date suffixes on walk-in drives', () => {
    const post = norm('Tech Mahindra Walk-in');
    expect(post.company).toBe('Tech Mahindra');
    expect(post.title).toBe('Multiple Roles');
    expect(post.employmentTypeRaw).toBe('Walk-in drive');
    expect(post.locationRaw.split(' | ')).toEqual(expect.arrayContaining(['Bengaluru', 'Hyderabad', 'Mumbai', 'Pune']));
  });

  it('handles off-campus drives, apprentices and internships', () => {
    expect(norm('Intellipaat').title).toBe('Business Development Associate – Trainee');
    expect(norm('IOCL Apprentice').company).toBe('IOCL');
    expect(norm('IOCL Apprentice').employmentTypeRaw).toBe('Apprentice');
    const intern = norm('Carrier Internship');
    expect(intern.sourceHint).toBe('internship');
    expect(intern.employmentTypeRaw).toBe('Internship');
  });

  it('parseTitle returns no company when the title has no known keyword', () => {
    expect(parseTitle('Some Random Post').company).toBeNull();
    expect(parseTitle('Infosys Walk-In Drive 2026 for Process/Senior Process Executive | 19 & 21 November 2026')).toEqual({
      company: 'Infosys',
      role: 'Process/Senior Process Executive',
    });
  });

  it('falls back to India when no city category exists', () => {
    expect(citiesFrom(['Jobs', 'Government Jobs'])).toEqual([]);
    expect(citiesFrom(['Bangalore Jobs', 'Jobs in Gurgaon'])).toEqual(['Bengaluru', 'Gurugram']);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RawPost, SourceAdapter } from '@beep/shared';
import { adzuna } from './adzuna.ts';
import { careerjet } from './careerjet.ts';
import { jobicy } from './jobicy.ts';
import { jooble } from './jooble.ts';
import { remoteok } from './remoteok.ts';
import { remotive } from './remotive.ts';
import { parseWwrFeed, weworkremotely } from './weworkremotely.ts';
import { remoteIndiaLocation, toDate } from './common.ts';
import adapters from '../aggregators.ts';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const json = (name: string) => JSON.parse(fixture(name));
const raws = (source: string, items: any[], idOf: (i: any) => string): RawPost[] =>
  items.map((payload) => ({ source, sourceJobId: idOf(payload), payload }));
const normalizeAll = (a: SourceAdapter, list: RawPost[]) => list.map((r) => a.normalize(r)).filter((p) => p !== null);

describe('registry shape', () => {
  it('exports unique, honestly described adapters', () => {
    const names = adapters.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    for (const a of adapters) {
      expect(a.meta.termsNotes).toContain('2026-11-18');
    }
  });
  it('keyed sources are unavailable without keys', () => {
    expect(adzuna.unavailableReason()).toBe('ADZUNA_APP_ID/ADZUNA_APP_KEY not set');
    expect(jooble.unavailableReason()).toMatch(/JOOBLE_API_KEY/);
    expect(careerjet.unavailableReason()).toMatch(/CAREERJET/);
  });
});

describe('common helpers', () => {
  it('keeps India-eligible location text only', () => {
    for (const t of ['Worldwide', 'Anywhere in the World', 'Asia Only', 'India', 'LATAM, Europe, USA, Canada, APAC']) {
      expect(remoteIndiaLocation(t)).toBe('Remote (India eligible)');
    }
    for (const t of ['USA', 'USA Only', 'Europe, Israel', '', undefined, 'Anywhere in the US']) {
      expect(remoteIndiaLocation(t)).toBeNull();
    }
  });
  it('parses zone-less timestamps as UTC', () => {
    expect(toDate('2026-11-14T20:33:53')?.toISOString()).toBe('2026-11-14T20:33:53.000Z');
    expect(toDate('')).toBeNull();
  });
});

describe('adzuna (from-docs fixture)', () => {
  const list = raws('adzuna', json('adzuna.from-docs.json').results, (i) => i.id);
  it('maps fields and drops senior titles', () => {
    const posts = normalizeAll(adzuna, list);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      source: 'adzuna',
      sourceJobId: '129698749',
      company: 'Example Systems Pvt Ltd',
      locationRaw: 'Bangalore, Karnataka',
      applyUrl: 'https://www.adzuna.in/land/ad/129698749?se=abc&v=123',
      employmentTypeRaw: 'full time permanent',
      compensationRaw: '300,000 - 400,000 INR per year (estimated by Adzuna)',
    });
    expect(posts[0]!.postedAt?.toISOString()).toBe('2026-11-10T18:07:39.000Z');
  });
});

describe('jooble (from-docs fixture)', () => {
  const list = raws('jooble', json('jooble.from-docs.json').jobs, (i) => String(i.id));
  it('maps fields, strips html, drops senior titles', () => {
    const posts = normalizeAll(jooble, list);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      title: 'Sales Trainee',
      company: 'ABC Corp',
      locationRaw: 'Mumbai',
      applyUrl: 'https://in.jooble.org/jdp/1234567890',
      compensationRaw: '15,000 - 20,000 INR',
      employmentTypeRaw: 'Full-time',
    });
    expect(posts[0]!.description).not.toContain('<b>');
  });
});

describe('careerjet (from-docs fixture)', () => {
  const list = raws('careerjet', json('careerjet.from-docs.json').jobs, (i) => i.url.split('/').pop());
  it('maps fields and salary unit', () => {
    const posts = normalizeAll(careerjet, list);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      title: 'Software Engineer Intern',
      locationRaw: 'Pune, Maharashtra',
      applyUrl: 'https://www.careerjet.co.in/jobad/in1a2b3c4d5e',
      compensationRaw: '15,000 INR per month',
    });
  });
});

describe('remotive (live fixture)', () => {
  const list = raws('remotive', json('remotive.json').jobs, (i) => String(i.id));
  it('keeps only India-eligible posts, marked remote', () => {
    const posts = normalizeAll(remotive, list);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThan(list.length);
    for (const p of posts) {
      expect(p.locationRaw).toBe('Remote (India eligible)');
      expect(p.applyUrl).toMatch(/^https:\/\/remotive\.com\/remote-jobs\//);
      expect(p.description).not.toMatch(/<\w+/);
      expect(p.postedAt).toBeInstanceOf(Date);
    }
  });
});

describe('remoteok (live fixture)', () => {
  const body = json('remoteok.json');
  const list = raws('remoteok', body.slice(1), (i) => String(i.id));
  it('ignores the legal header and keeps worldwide/India posts', () => {
    expect(body[0].legal).toContain('link back');
    const posts = normalizeAll(remoteok, list);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.locationRaw === 'Remote (India eligible)' && /remoteok\.com\//i.test(p.applyUrl))).toBe(true);
  });
});

describe('weworkremotely (live fixture)', () => {
  const items = parseWwrFeed(fixture('weworkremotely.xml'));
  const list = items.map((i) => ({ source: 'weworkremotely', sourceJobId: i.guid ?? i.link ?? '', payload: i }));
  it('parses the feed', () => expect(items).toHaveLength(3));
  it('splits company and title, keeps worldwide and Asia only', () => {
    const posts = normalizeAll(weworkremotely, list);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ company: 'Elvoro', title: 'AI Creative Engineer (Social Media)', locationRaw: 'Remote (India eligible)' });
    expect(posts[0]!.applyUrl).toMatch(/^https:\/\/weworkremotely\.com\/remote-jobs\//);
  });
});

describe('jobicy (live fixture)', () => {
  const list = raws('jobicy', json('jobicy.json').jobs, (i) => String(i.id));
  it('keeps Anywhere, drops single-country geos and senior APAC roles', () => {
    const posts = normalizeAll(jobicy, list);
    expect(posts.map((p) => p.sourceJobId)).toEqual([list[0]!.sourceJobId, list[1]!.sourceJobId]);
    expect(posts.every((p) => p.applyUrl.startsWith('https://jobicy.com/jobs/'))).toBe(true);
    expect(posts[0]!.description).not.toMatch(/<\w+/);
  });
});

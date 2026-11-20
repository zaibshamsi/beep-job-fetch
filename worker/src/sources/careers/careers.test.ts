import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { JobPostSchema, type RawPost } from '@beep/shared';
import { decodeBody, newestFirst, parseFeed, parseSitemap } from './discover.ts';
import { INDIA_URL_ALTERNATION, isIndiaLocation, isSeniorTitle } from './filters.ts';
import { extractJobPostings, normalizeJobPosting, type CareersPayload } from './jobposting.ts';
import { loadSites } from './jsonld.ts';

const fx = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

function raw(file: string, site = 'Test Co', mutate?: (jp: any) => void): RawPost {
  const jp = extractJobPostings(fx(file))[0];
  mutate?.(jp);
  const payload: CareersPayload = { site, slug: 'test', pageUrl: 'https://careers.example.com/job/1', jobPosting: jp };
  return { source: 'jsonld-careers', sourceJobId: 'test:1', payload };
}
const norm = (r: RawPost) => normalizeJobPosting(r, 'jsonld-careers', new Date('2026-11-18T00:00:00Z'));

describe('extractJobPostings', () => {
  it('finds the JobPosting among several JSON-LD blocks', () => {
    const found = extractJobPostings(fx('lowes-job.html'));
    expect(found).toHaveLength(1);
    expect(found[0]['@type']).toBe('JobPosting');
  });

  it('tolerates raw control characters inside JSON strings and ignores pages without JobPosting', () => {
    const html = '<script type="application/ld+json">{"@type":"JobPosting","title":"A\nB"}</script>';
    expect(extractJobPostings(html)[0].title).toContain('A');
    expect(extractJobPostings('<script type="application/ld+json">{"@type":"Organization"}</script>')).toEqual([]);
    expect(extractJobPostings('<html></html>')).toEqual([]);
  });

  it('finds postings nested in @graph', () => {
    const html = '<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":"JobPosting","title":"X"}]}</script>';
    expect(extractJobPostings(html)).toHaveLength(1);
  });
});

describe('normalizeJobPosting', () => {
  it('maps a Radancy page (Barclays, Pune)', () => {
    const post = norm(raw('barclays-job.html', 'Barclays'))!;
    expect(JobPostSchema.safeParse(post).success).toBe(true);
    expect(post.title).toBe('Application Developer');
    expect(post.company).toBe('Barclays');
    expect(post.locationRaw).toMatch(/Pune.*India/);
    expect(post.postedAt?.toISOString().slice(0, 10)).toBe('2026-11-17');
    expect(post.sourceJobId).toBe('test:JR-0000034273');
    expect(post.description).not.toMatch(/<[a-z]/i);
    expect(post.description.length).toBeLessThanOrEqual(6000);
    expect(post.compensationRaw).toBeNull(); // empty MonetaryAmount in the source
    expect(post.applyUrl).toMatch(/^https:\/\//);
  });

  it('unescapes entity-encoded HTML descriptions (Phenom, Lowe\'s Bengaluru)', () => {
    const post = norm(raw('lowes-job.html', "Lowe's"))!;
    expect(post.description).toContain('Innovate in Bengaluru');
    expect(post.description).not.toMatch(/&lt;|&gt;|&#39;/);
    expect(post.description).toContain("Lowe's offers");
    expect(post.employmentTypeRaw).toBe('FULL_TIME');
    expect(post.locationRaw).toContain('Bengaluru');
  });

  it('accepts a country given as {name: "IN"} but drops clearly senior titles', () => {
    expect(norm(raw('qualcomm-job.html'))).toBeNull(); // "Lead/Staff/Sr Staff"
    const post = norm(raw('qualcomm-job.html', 'Qualcomm', (jp) => (jp.title = 'Hardware Engineer')))!;
    expect(post.locationRaw).toContain('Bengaluru');
    expect(post.postedAt?.toISOString().slice(0, 10)).toBe('2026-07-17');
  });

  it('rejects non-India locations even when a city name matches', () => {
    const us = norm(raw('barclays-job.html', 'X', (jp) => (jp.jobLocation = [{ address: { addressLocality: 'Salem', addressRegion: 'OR', addressCountry: 'US' } }])));
    expect(us).toBeNull();
    const uk = norm(raw('barclays-job.html', 'X', (jp) => (jp.jobLocation = { address: { addressLocality: 'London', addressCountry: 'GB' } })));
    expect(uk).toBeNull();
  });

  it('keeps multi-location postings that include India, and string locations', () => {
    const multi = norm(raw('barclays-job.html', 'X', (jp) => (jp.jobLocation = [{ address: { addressLocality: 'London', addressCountry: 'GB' } }, { address: { addressLocality: 'Pune', addressCountry: 'IN' } }])));
    expect(multi?.locationRaw).toContain('Pune');
    const text = norm(raw('barclays-job.html', 'X', (jp) => (jp.jobLocation = 'Hyderabad, Telangana')));
    expect(text?.locationRaw).toBe('Hyderabad, Telangana');
  });

  it('drops placeholder address parts like "unavailable"', () => {
    const post = norm(raw('barclays-job.html', 'X', (jp) => (jp.jobLocation = { address: { streetAddress: 'unavailable', addressLocality: 'Chennai', addressRegion: 'State not Applicable', addressCountry: 'India' } })));
    expect(post?.locationRaw).toBe('Chennai, India');
  });

  it('accepts remote-in-India via applicantLocationRequirements', () => {
    const post = norm(raw('barclays-job.html', 'X', (jp) => {
      delete jp.jobLocation;
      jp.jobLocationType = 'TELECOMMUTE';
      jp.applicantLocationRequirements = { '@type': 'Country', name: 'India' };
    }));
    expect(post?.locationRaw).toBe('India');
  });

  it('drops expired postings and keeps ones with a future validThrough', () => {
    expect(norm(raw('barclays-job.html', 'X', (jp) => (jp.validThrough = '2026-10-01')))).toBeNull();
    expect(norm(raw('barclays-job.html', 'X', (jp) => (jp.validThrough = '2027-01-01')))).not.toBeNull();
  });

  it('reads baseSalary, caps the description, and tolerates a bad datePosted', () => {
    const post = norm(
      raw('barclays-job.html', 'X', (jp) => {
        jp.baseSalary = { '@type': 'MonetaryAmount', currency: 'INR', value: { '@type': 'QuantitativeValue', minValue: 400000, maxValue: 600000, unitText: 'YEAR' } };
        jp.datePosted = 'not a date';
        jp.description = 'x'.repeat(20000);
      }),
    )!;
    expect(post.compensationRaw).toBe('INR 400000-600000 YEAR');
    expect(post.postedAt).toBeNull();
    expect(post.description.length).toBeLessThanOrEqual(6000);
  });

  it('uses the posting url, falls back to the page URL, and returns null for malformed payloads', () => {
    const post = norm(raw('synopsys-job.html', 'Synopsys'))!;
    expect(post.applyUrl.startsWith('https://careers.synopsys.com/job/bengaluru/')).toBe(true);
    expect(post.title).toBe('REQ-19785 Intern (Infrastructure)');
    const noUrl = norm(raw('synopsys-job.html', 'Synopsys', (jp) => delete jp.url))!;
    expect(noUrl.applyUrl).toBe('https://careers.example.com/job/1');
    expect(norm({ source: 'jsonld-careers', sourceJobId: 'x', payload: {} })).toBeNull();
    expect(norm({ source: 'jsonld-careers', sourceJobId: 'x', payload: null })).toBeNull();
  });
});

describe('filters', () => {
  it('flags senior titles but not trainee/management-trainee titles', () => {
    for (const t of ['Senior Engineer', 'Sr. Analyst', 'Engineering Manager', 'Principal Scientist', 'Staff SWE', 'VP, Risk', 'Head of Data'])
      expect(isSeniorTitle(t), t).toBe(true);
    for (const t of ['Graduate Engineer Trainee', 'Management Trainee', 'Software Engineer', 'Intern - Data', 'Associate Analyst'])
      expect(isSeniorTitle(t), t).toBe(false);
  });

  it('detects India by country, name or gazetteer city', () => {
    expect(isIndiaLocation('Pune, Maharashtra', [])).toBe(true);
    expect(isIndiaLocation('Somewhere, India')).toBe(true);
    expect(isIndiaLocation('Berlin, Germany')).toBe(false);
    expect(isIndiaLocation('Indiana, USA')).toBe(false);
    expect(isIndiaLocation('Hyderabad', ['IN'])).toBe(true);
    expect(isIndiaLocation('Salem', ['US'])).toBe(false);
    expect(isIndiaLocation('1992 LANCASTER DR NE, SALEM, OR')).toBe(false);
    expect(isIndiaLocation('Salem, Tamil Nadu')).toBe(true);
    expect(isIndiaLocation('Salt Lake City, UT')).toBe(false);
  });

  it('builds a URL-slug alternation for {INDIA} patterns', () => {
    const re = new RegExp(`/job/${INDIA_URL_ALTERNATION}/`, 'i');
    expect(re.test('https://x.com/job/bengaluru/title/1/2')).toBe(true);
    expect(re.test('https://x.com/job/navi-mumbai/title/1/2')).toBe(true);
    expect(re.test('https://x.com/job/london/title/1/2')).toBe(false);
  });
});

describe('discovery parsers', () => {
  it('parses a urlset with lastmod', () => {
    const doc = parseSitemap(fx('citi-sitemap.xml'))!;
    expect(doc.kind).toBe('urlset');
    expect(doc.entries.length).toBeGreaterThan(3);
    expect(doc.entries[0].loc).toMatch(/^https:\/\/jobs\.citi\.com\/job\//);
    expect(doc.entries[0].lastmod).toMatch(/^2026-/);
  });

  it('parses a sitemap index', () => {
    const doc = parseSitemap(fx('accenture-sitemap-index.xml'))!;
    expect(doc.kind).toBe('index');
    expect(doc.entries.some((e) => /jobpostings-sitemap\.xml$/.test(e.loc))).toBe(true);
  });

  it('returns null for non-sitemap bodies', () => {
    expect(parseSitemap('<html></html>')).toBeNull();
    expect(parseSitemap('not xml at all')).toBeNull();
  });

  it('parses RSS item links and Atom entries', () => {
    const items = parseFeed(fx('teamtailor-feed.xml'));
    expect(items.length).toBe(2);
    expect(items[0].loc).toMatch(/^https:\/\/career\.teamtailor\.com\/jobs\//);
    const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><link rel="alternate" href="https://a.example/j/1"/><updated>2026-11-01T00:00:00Z</updated></entry></feed>';
    expect(parseFeed(atom)).toEqual([{ loc: 'https://a.example/j/1', lastmod: '2026-11-01T00:00:00Z' }]);
  });

  it('orders newest first and keeps undated entries last', () => {
    const out = newestFirst([
      { loc: 'a', lastmod: null },
      { loc: 'b', lastmod: '2026-01-01' },
      { loc: 'c', lastmod: '2026-06-01' },
    ]);
    expect(out.map((e) => e.loc)).toEqual(['c', 'b', 'a']);
  });

  it('decodes gzipped sitemaps', () => {
    const xml = fx('citi-sitemap.xml');
    expect(decodeBody(gzipSync(Buffer.from(xml)))).toBe(xml);
    expect(decodeBody(Buffer.from(xml))).toBe(xml);
  });
});

describe('sites.json', () => {
  it('has unique slugs, https discovery URLs and a discovery channel per site', () => {
    const sites = loadSites();
    expect(sites.length).toBeGreaterThan(0);
    expect(new Set(sites.map((s) => s.slug)).size).toBe(sites.length);
    for (const s of sites) {
      const url = s.sitemapUrl ?? s.feedUrl ?? s.listUrl;
      expect(url, s.slug).toMatch(/^https:\/\//);
      if (s.urlPattern) expect(() => new RegExp(s.urlPattern!.replaceAll('{INDIA}', INDIA_URL_ALTERNATION), 'i'), s.slug).not.toThrow();
      expect(s.maxPages ?? 300).toBeLessThanOrEqual(300);
    }
  });
});

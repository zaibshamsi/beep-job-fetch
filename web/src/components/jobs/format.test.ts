import { describe, expect, it } from 'vitest';
import { clipParagraphs, decodeEntities, formatExperience, formatRelative, formatStipend, plural, toParagraphs } from './format.ts';

describe('formatStipend', () => {
  it('formats a range with Indian digit grouping', () => {
    expect(formatStipend(15000, 20000)).toBe('₹15,000–20,000/month');
    expect(formatStipend(150000, 250000)).toBe('₹1,50,000–2,50,000/month');
  });
  it('formats a single amount', () => {
    expect(formatStipend(15000, null)).toBe('₹15,000/month');
    expect(formatStipend(15000, 15000)).toBe('₹15,000/month');
  });
  it('says "Up to" when only the top is known', () => {
    expect(formatStipend(null, 20000)).toBe('Up to ₹20,000/month');
    expect(formatStipend(0, 20000)).toBe('Up to ₹20,000/month');
  });
  it('returns null when nothing is stated and "Unpaid" for zero', () => {
    expect(formatStipend(null, null)).toBeNull();
    expect(formatStipend(undefined, undefined)).toBeNull();
    expect(formatStipend(0, 0)).toBe('Unpaid');
  });
});

describe('formatExperience', () => {
  it('formats ranges and single values', () => {
    expect(formatExperience(0, 1)).toBe('0–1 years');
    expect(formatExperience(1, 1)).toBe('1 year');
    expect(formatExperience(2, null)).toBe('2+ years');
    expect(formatExperience(null, 1)).toBe('Up to 1 year');
    expect(formatExperience(null, null)).toBeNull();
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  it('uses words for recent times', () => {
    expect(formatRelative('2026-11-18T11:59:30Z', now)).toBe('just now');
    expect(formatRelative('2026-11-18T11:25:00Z', now)).toBe('35 minutes ago');
    expect(formatRelative('2026-11-18T09:00:00Z', now)).toBe('3 hours ago');
    expect(formatRelative('2026-11-17T10:00:00Z', now)).toBe('yesterday');
    expect(formatRelative('2026-11-08T12:00:00Z', now)).toBe('10 days ago');
  });
  it('never says "in ..." for clock skew and falls back to a date after 30 days', () => {
    expect(formatRelative('2026-11-18T12:05:00Z', now)).toBe('just now');
    expect(formatRelative('2026-09-01T12:00:00Z', now)).toMatch(/1 Sept? 2026/);
  });
  it('returns an empty string for bad input', () => {
    expect(formatRelative('not a date', now)).toBe('');
  });
});

describe('plural', () => {
  it('joins number and unit with a no-break space', () => {
    expect(plural(1, 'job')).toBe('1 job');
    expect(plural(1520, 'job')).toBe('1,520 jobs');
  });
});

describe('toParagraphs / clipParagraphs', () => {
  it('splits on blank lines, collapses whitespace and joins lone bullets', () => {
    const text = 'Roles \n\n- As a  Field Sales\n Executive \n\n- \n\n You will support sales.\n\n\n';
    expect(toParagraphs(text)).toEqual(['Roles', '- As a Field Sales Executive', '- You will support sales.']);
  });
  it('clips at a word boundary with an ellipsis', () => {
    const paras = ['a'.repeat(50), 'word '.repeat(100).trim()];
    const out = clipParagraphs(paras, 200);
    expect(out.clipped).toBe(true);
    expect(out.paras).toHaveLength(2);
    expect(out.paras[1].endsWith('word…')).toBe(true);
    expect(out.paras[1].length).toBeLessThanOrEqual(151);
  });
  it('keeps short descriptions whole', () => {
    expect(clipParagraphs(['short', 'text'], 1200)).toEqual({ paras: ['short', 'text'], clipped: false });
  });
});

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('not toy projects &mdash; real ones &amp; fast')).toBe('not toy projects — real ones & fast');
    expect(decodeEntities('It&#39;s &#x2013; fine&nbsp;now')).toBe('It\'s – fine now');
  });
  it('leaves unknown entities and plain text alone', () => {
    expect(decodeEntities('a &madeup; b & c')).toBe('a &madeup; b & c');
    expect(decodeEntities('&#99999999;')).toBe('&#99999999;');
  });
  it('runs before paragraphs are split', () => {
    expect(toParagraphs('A &amp; B\n\nC')).toEqual(['A & B', 'C']);
  });
});

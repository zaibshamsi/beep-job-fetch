import { describe, expect, it } from 'vitest';
import {
  aiModeLine,
  csvCell,
  formatDateTime,
  formatDuration,
  formatInt,
  formatPercent,
  formatRate,
  formatRelative,
  formatUsd,
  plural,
  toCsv,
} from './format.ts';

const S = ' ';

describe('formatInt', () => {
  it('groups digits the Indian way', () => {
    expect(formatInt(520)).toBe('520');
    expect(formatInt(3515)).toBe('3,515');
    expect(formatInt(1234567)).toBe('12,34,567');
  });
  it('rounds and handles missing values', () => {
    expect(formatInt(12.6)).toBe('13');
    expect(formatInt(null)).toBe('–');
    expect(formatInt(undefined)).toBe('–');
    expect(formatInt(Number.NaN)).toBe('–');
  });
});

describe('formatUsd', () => {
  it('keeps four decimals by default', () => {
    expect(formatUsd(0.05333)).toBe('$0.0533');
    expect(formatUsd(0)).toBe('$0.0000');
    expect(formatUsd(1234.5, 2)).toBe('$1,234.50');
  });
  it('handles negatives and null', () => {
    expect(formatUsd(-0.5, 2)).toBe('-$0.50');
    expect(formatUsd(null)).toBe('–');
  });
});

describe('formatPercent and formatRate', () => {
  it('formats 0..100 values', () => {
    expect(formatPercent(92)).toBe('92%');
    expect(formatPercent(96.5)).toBe('96.5%');
    expect(formatPercent(null)).toBe('–');
  });
  it('formats 0..1 ratios', () => {
    expect(formatRate(0.028)).toBe('2.8%');
    expect(formatRate(1)).toBe('100%');
  });
});

describe('formatDuration', () => {
  it('uses the right unit for each range', () => {
    expect(formatDuration(850)).toBe(`850${S}ms`);
    expect(formatDuration(4200)).toBe(`4.2${S}s`);
    expect(formatDuration(41000)).toBe(`41${S}s`);
    expect(formatDuration(773700)).toBe(`12${S}min 54${S}s`);
    expect(formatDuration(120000)).toBe(`2${S}min`);
    expect(formatDuration(3_900_000)).toBe(`1${S}h 05${S}min`);
  });
  it('returns a dash for missing values', () => {
    expect(formatDuration(null)).toBe('–');
    expect(formatDuration(-1)).toBe('–');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');
  it('describes the past', () => {
    expect(formatRelative('2026-11-18T11:59:40.000Z', now)).toBe('just now');
    expect(formatRelative('2026-11-18T11:55:00.000Z', now)).toBe(`5${S}min ago`);
    expect(formatRelative('2026-11-18T09:00:00.000Z', now)).toBe(`3${S}h ago`);
    expect(formatRelative('2026-11-17T10:00:00.000Z', now)).toBe('yesterday');
    expect(formatRelative('2026-11-14T12:00:00.000Z', now)).toBe(`4${S}days ago`);
  });
  it('describes the future and bad input', () => {
    expect(formatRelative('2026-11-18T12:05:00.000Z', now)).toBe(`in 5${S}min`);
    expect(formatRelative(null, now)).toBe('–');
    expect(formatRelative('not a date', now)).toBe('–');
  });
});

describe('formatDateTime', () => {
  it('shows Indian time', () => {
    expect(formatDateTime('2026-11-18T09:13:22.423Z')).toBe(`18 Nov, 14:43${S}IST`);
    expect(formatDateTime('2026-11-17T18:30:00.000Z')).toBe(`18 Nov, 00:00${S}IST`);
  });
});

describe('plural', () => {
  it('picks the right noun', () => {
    expect(plural(1, 'job')).toBe(`1${S}job`);
    expect(plural(2520, 'job')).toBe(`2,520${S}jobs`);
  });
});

describe('csv', () => {
  it('quotes cells that need it', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a, b')).toBe('"a, b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(['Pune', 'Mumbai'])).toBe('Pune; Mumbai');
    expect(csvCell(null)).toBe('');
    expect(csvCell(true)).toBe('true');
  });
  it('joins rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x,y']])).toBe('a,b\r\n1,"x,y"\r\n');
  });
});

describe('aiModeLine', () => {
  it('words each tagging mode without pointing at Settings', () => {
    expect(aiModeLine('full')).toBe('Jev + LLM: full tagging');
    expect(aiModeLine('jev_only')).toBe('Jev only: rules + Jev');
    expect(aiModeLine('llm_only')).toBe('LLM only: rules + LLM');
    expect(aiModeLine('rules_only')).toBe('Rules only: AI tagging is off');
  });
});

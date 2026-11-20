import { describe, expect, it } from 'vitest';
import { MIN_HEIGHT, columnColor, columnHeight, maxColumnPixels, metersPerPixel } from './scale.ts';
import { ACCENT_DARK, ACCENT_LIGHT } from './colors.ts';
import { buildRows, type Registry } from './rows.ts';
import type { CitySummary } from '../api/types.ts';

describe('columnHeight', () => {
  it('is 0 for no jobs and 1 for the biggest city', () => {
    expect(columnHeight(0, 120)).toBe(0);
    expect(columnHeight(5, 0)).toBe(0);
    expect(columnHeight(120, 120)).toBeCloseTo(1);
  });

  it('gives one job a visible minimum', () => {
    expect(columnHeight(1, 120)).toBeGreaterThan(MIN_HEIGHT);
    expect(columnHeight(1, 100_000)).toBeGreaterThanOrEqual(MIN_HEIGHT);
  });

  it('uses square-root scaling so the biggest city does not dwarf the rest', () => {
    // a city with a quarter of the jobs is about half as tall, not a quarter
    const quarter = columnHeight(30, 120);
    expect(quarter).toBeGreaterThan(0.5);
    expect(quarter).toBeLessThan(0.6);
  });

  it('grows monotonically', () => {
    let prev = 0;
    for (let c = 1; c <= 200; c++) {
      const h = columnHeight(c, 200);
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
  });
});

describe('columnColor', () => {
  it('runs from saffron-orange (small) to rose (biggest)', () => {
    expect(columnColor(120, 120)).toEqual(ACCENT_DARK);
    expect(columnColor(0, 120)).toEqual(ACCENT_LIGHT);
    const mid = columnColor(30, 120);
    expect(mid[1]).toBeLessThan(ACCENT_LIGHT[1]);
    expect(mid[1]).toBeGreaterThan(ACCENT_DARK[1]);
  });
});

describe('maxColumnPixels / metersPerPixel', () => {
  it('scales with the shorter side within bounds', () => {
    expect(maxColumnPixels(1440, 900)).toBe(230);
    expect(maxColumnPixels(390, 464)).toBeCloseTo(101.4);
    expect(maxColumnPixels(200, 150)).toBe(70);
  });
  it('halves per zoom level', () => {
    expect(metersPerPixel(5, 20) / metersPerPixel(6, 20)).toBeCloseTo(2);
    expect(metersPerPixel(0, 0)).toBeCloseTo(78271.5, 0);
  });
});

describe('buildRows', () => {
  const city = (name: string, count: number): CitySummary => ({ city: name, state: 'X', lat: 20, lng: 78, count, topRoles: [] });

  it('keeps each city at the same index across filter changes', () => {
    const reg: Registry = new Map();
    const a = buildRows(reg, [], [city('Bengaluru', 100), city('Pune', 10)], 5);
    const b = buildRows(reg, a, [city('Pune', 40), city('Delhi', 3)], 0);
    expect(a.map((r) => r.key)).toEqual(['Remote', 'Bengaluru', 'Pune']);
    expect(b.map((r) => r.key)).toEqual(['Remote', 'Bengaluru', 'Pune', 'Delhi']);
    expect(b.map((r) => r.count)).toEqual([0, 0, 40, 3]);
  });
});

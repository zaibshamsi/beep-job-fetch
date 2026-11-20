import { describe, expect, it } from 'vitest';
import { labelBox, pickLabels } from './labels.ts';

const c = (city: string, x: number, y: number, n: number) => ({ city, x, y, r: 4 + Math.sqrt(n) * 1.6, n });

describe('pickLabels', () => {
  it('labels cities with 13 or more jobs only', () => {
    const out = pickLabels([c('Bengaluru', 100, 400, 133), c('Kochi', 120, 450, 4), c('Ahmedabad', 20, 200, 13)]);
    expect([...out].sort()).toEqual(['Ahmedabad', 'Bengaluru']);
  });

  it('drops the smaller label of two that would overlap', () => {
    const out = pickLabels([c('Mumbai', 100, 300, 45), c('Pune', 112, 300, 20), c('Hyderabad', 300, 300, 43)]);
    expect(out.has('Mumbai')).toBe(true);
    expect(out.has('Pune')).toBe(false);
    expect(out.has('Hyderabad')).toBe(true);
  });

  it('puts the label box above the beacon, wider for longer names', () => {
    const a = labelBox(c('Pune', 100, 100, 20));
    const b = labelBox(c('Thiruvananthapuram', 100, 100, 20));
    expect(a.y1).toBeLessThan(100);
    expect(b.x1 - b.x0).toBeGreaterThan(a.x1 - a.x0);
  });

  it('can lower the threshold', () => {
    expect(pickLabels([c('Kochi', 0, 0, 4)], 3).has('Kochi')).toBe(true);
  });
});

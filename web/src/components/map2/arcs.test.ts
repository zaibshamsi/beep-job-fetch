import { describe, expect, it } from 'vitest';
import { arcLayout, arcRadius } from './arcs.ts';

describe('arcLayout', () => {
  it('returns nothing without jobs', () => {
    expect(arcLayout([], 40)).toEqual([]);
    expect(arcLayout([{ key: 'Tech', count: 0 }], 40)).toEqual([]);
  });

  it('draws one arc per family with lengths in proportion to the counts', () => {
    const arcs = arcLayout(
      [
        { key: 'Tech', count: 30 },
        { key: 'Sales', count: 10 },
      ],
      50,
    );
    expect(arcs.map((a) => a.key)).toEqual(['Tech', 'Sales']);
    // minus the gap on both ends the ratio is a bit above 3
    expect(arcs[0]!.len / arcs[1]!.len).toBeGreaterThan(3);
    expect(arcs[0]!.len / arcs[1]!.len).toBeLessThan(3.5);
    expect(arcs[0]!.len + arcs[1]!.len).toBeLessThan(2 * Math.PI * 50);
  });

  it('starts at 12 oclock and sweeps clockwise', () => {
    const [a] = arcLayout(
      [
        { key: 'Tech', count: 1 },
        { key: 'Data', count: 1 },
      ],
      100,
    );
    const m = /^M(-?[\d.]+) (-?[\d.]+)A/.exec(a!.d)!;
    expect(Number(m[1])).toBeCloseTo(100 * Math.cos(-Math.PI / 2 + 0.045), 1);
    expect(Number(m[2])).toBeLessThan(-99);
    expect(a!.d).toContain(' 0 0 1 '); // small arc, clockwise
  });

  it('uses the large-arc flag past half a circle and survives a single family', () => {
    const [big] = arcLayout(
      [
        { key: 'Tech', count: 9 },
        { key: 'Data', count: 1 },
      ],
      50,
    );
    expect(big!.d).toContain(' 0 1 1 ');
    const [only] = arcLayout([{ key: 'Tech', count: 5 }], 50);
    expect(only!.len).toBeGreaterThan(2 * Math.PI * 50 * 0.99);
    expect(only!.d).toContain(' 0 1 1 ');
  });

  it('anchors labels by side', () => {
    const arcs = arcLayout(
      [
        { key: 'a', count: 25 },
        { key: 'b', count: 25 },
        { key: 'c', count: 25 },
        { key: 'd', count: 25 },
      ],
      50,
    );
    expect(arcs.map((a) => a.anchor)).toEqual(['start', 'start', 'end', 'end']);
  });

  it('puts the ring outside the beacon', () => {
    expect(arcRadius(10)).toBe(44);
  });
});

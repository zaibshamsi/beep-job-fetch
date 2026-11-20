import { describe, expect, it } from 'vitest';
import { hashId, offsetLngLat, placeOnSpiral, spiralOffset, spiralRadius } from './spiral.ts';

const BLR: [number, number] = [77.5946, 12.9716];
const jobs = (ids: number[]) => ids.map((id) => ({ id }));
const meters = (a: [number, number], b: [number, number]) => {
  const dy = (a[1] - b[1]) * 111_320;
  const dx = (a[0] - b[0]) * 111_320 * Math.cos((b[1] * Math.PI) / 180);
  return Math.hypot(dx, dy);
};

describe('hashId', () => {
  it('is deterministic and spreads neighbouring ids', () => {
    expect(hashId(42)).toBe(hashId(42));
    expect(hashId(1)).not.toBe(hashId(2));
    expect(hashId(7)).toBeGreaterThanOrEqual(0);
  });
});

describe('spiralRadius', () => {
  it('grows with count and stays within 600 m .. 6.5 km', () => {
    expect(spiralRadius(0)).toBe(0);
    expect(spiralRadius(1)).toBe(600);
    expect(spiralRadius(25)).toBeGreaterThan(spiralRadius(4));
    expect(spiralRadius(100)).toBeGreaterThan(spiralRadius(25));
    expect(spiralRadius(10_000)).toBe(6500);
  });
});

describe('spiralOffset', () => {
  it('keeps every slot inside the radius, nearest first', () => {
    const n = 50;
    const r = spiralRadius(n);
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const [e, nn] = spiralOffset(i, n, r);
      const d = Math.hypot(e, nn);
      expect(d).toBeLessThanOrEqual(r + 1e-6);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });
});

describe('offsetLngLat', () => {
  it('moves the right distance', () => {
    const p = offsetLngLat(BLR, 1000, 0);
    expect(meters(p, BLR)).toBeCloseTo(1000, 0);
    const q = offsetLngLat(BLR, 0, -2500);
    expect(meters(q, BLR)).toBeCloseTo(2500, 0);
    expect(q[1]).toBeLessThan(BLR[1]);
  });
});

describe('placeOnSpiral', () => {
  it('gives the same position to a job whatever the input order', () => {
    const ids = Array.from({ length: 60 }, (_, i) => 1000 + i * 7);
    const a = placeOnSpiral(BLR, jobs(ids));
    const b = placeOnSpiral(BLR, jobs([...ids].reverse()));
    const pos = (list: typeof a) => new Map(list.map((p) => [p.item.id, p.position.join(',')]));
    expect(pos(a)).toEqual(pos(b));
  });

  it('keeps pins apart and within the radius', () => {
    const list = placeOnSpiral(BLR, jobs(Array.from({ length: 150 }, (_, i) => i + 1)));
    const r = spiralRadius(150);
    let minGap = Infinity;
    for (let i = 0; i < list.length; i++) {
      expect(meters(list[i]!.position, BLR)).toBeLessThanOrEqual(r + 1);
      for (let j = i + 1; j < list.length; j++) minGap = Math.min(minGap, meters(list[i]!.position, list[j]!.position));
    }
    // sunflower packing: neighbours are roughly r * sqrt(pi / n) apart; never stacked
    expect(minGap).toBeGreaterThan(200);
  });

  it('handles empty input', () => {
    expect(placeOnSpiral(BLR, [])).toEqual([]);
  });
});

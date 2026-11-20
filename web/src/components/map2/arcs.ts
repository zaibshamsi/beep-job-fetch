/** Geometry of the category arcs drawn around the selected city (pure, tested in arcs.test.ts). */

export interface ArcItem {
  key: string;
  count: number;
}

export interface Arc {
  key: string;
  count: number;
  /** SVG path data of the arc (centred on 0,0). */
  d: string;
  /** Length of the arc, for the dash-offset draw-in. */
  len: number;
  /** Label position, just outside the arc, and its text-anchor. */
  labelX: number;
  labelY: number;
  anchor: 'start' | 'middle' | 'end';
}

const f2 = (n: number) => n.toFixed(2);

/** Radius of the arc ring for a beacon of radius r. */
export const arcRadius = (r: number) => r + 34;

/**
 * One arc per item, sized by its share of the total, starting at 12 o'clock and going clockwise,
 * with a small gap between arcs. Items with no count are skipped.
 */
export function arcLayout(items: ArcItem[], R: number): Arc[] {
  const list = items.filter((i) => i.count > 0);
  const total = list.reduce((s, i) => s + i.count, 0);
  if (total <= 0) return [];
  const gap = list.length > 1 ? 0.09 : 0;
  let a = -Math.PI / 2;
  return list.map((item) => {
    const span = Math.min((2 * Math.PI * item.count) / total, 2 * Math.PI - 0.02);
    const a0 = a + gap / 2;
    const a1 = a + span - gap / 2;
    const P = (t: number): [number, number] => [R * Math.cos(t), R * Math.sin(t)];
    const [x0, y0] = P(a0);
    const [x1, y1] = P(a1);
    const mid = (a0 + a1) / 2;
    const cs = Math.cos(mid);
    a += span;
    return {
      key: item.key,
      count: item.count,
      d: `M${f2(x0)} ${f2(y0)}A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f2(x1)} ${f2(y1)}`,
      len: R * (a1 - a0),
      labelX: (R + 16) * cs,
      labelY: (R + 16) * Math.sin(mid) + 4,
      anchor: Math.abs(cs) < 0.3 ? 'middle' : cs > 0 ? 'start' : 'end',
    };
  });
}

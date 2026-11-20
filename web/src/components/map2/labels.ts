/** Which beacons get a permanent name label at the full view (pure, tested in labels.test.ts). */

export interface LabelCandidate {
  city: string;
  x: number;
  y: number;
  /** Beacon radius in design units. */
  r: number;
  n: number;
}

/** Cities with at least this many jobs are labelled (the design's rule), if their label does not collide. */
export const LABEL_MIN = 13;

/** Estimated size of the label "<city> <n>" in design units at the full view (11px sans, 600). */
export function labelBox(c: LabelCandidate): { x0: number; x1: number; y0: number; y1: number } {
  const w = (c.city.length + String(c.n).length + 1) * 6.3 + 6;
  const cy = c.y - c.r - 9;
  return { x0: c.x - w / 2, x1: c.x + w / 2, y0: cy - 11, y1: cy + 4 };
}

/** Labels to show: big cities first, a label is dropped when it would overlap one already placed. */
export function pickLabels(cities: LabelCandidate[], min = LABEL_MIN): Set<string> {
  const placed: ReturnType<typeof labelBox>[] = [];
  const out = new Set<string>();
  for (const c of [...cities].filter((c) => c.n >= min).sort((a, b) => b.n - a.n)) {
    const b = labelBox(c);
    if (placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)) continue;
    placed.push(b);
    out.add(c.city);
  }
  return out;
}

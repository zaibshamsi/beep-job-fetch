/**
 * Which city labels to draw, and where: the biggest cities first, each tried below its column base, then to the right,
 * then to the left; a label that would overlap one already placed in all three spots is skipped.
 */
import { WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import type { ColumnRow } from './rows.ts';
import { CAMERA, type Size } from './camera.ts';

export const LABEL_SIZE = 12;
const CHAR_W = 6.6; // average advance at 12px, Host Grotesk 500 (slightly generous)
const PAD_X = 5;
const BOX_H = 19;
const GAP = 3;

export interface PlacedLabel {
  row: ColumnRow;
  text: string;
  anchor: 'start' | 'middle' | 'end';
  baseline: 'top' | 'center';
  offset: [number, number];
}

export function labelText(row: ColumnRow): string {
  return row.count > 0 ? `${row.city} ${row.count.toLocaleString('en-IN')}` : row.city;
}

type Box = [number, number, number, number];

export function pickLabels(rows: readonly ColumnRow[], vs: MapViewState, size: Size, max = 12): PlacedLabel[] {
  const vp = new WebMercatorViewport({ ...vs, ...size, ...CAMERA });
  const boxes: Box[] = [];
  const out: PlacedLabel[] = [];
  const candidates = rows
    .filter((r) => r.isRemote || r.count > 0)
    // Remote first (it always has its label), then by count
    .sort((a, b) => Number(b.isRemote) - Number(a.isRemote) || b.count - a.count || a.city.localeCompare(b.city));
  const free = (b: Box) =>
    b[0] >= 0 &&
    b[2] <= size.width &&
    !boxes.some((o) => b[0] < o[2] + GAP && b[2] > o[0] - GAP && b[1] < o[3] + GAP && b[3] > o[1] - GAP);

  for (const row of candidates) {
    if (out.length >= max + 1) break; // +1: Remote does not count against the city budget
    const [x, y] = vp.project(row.position) as [number, number];
    const text = labelText(row);
    const w = text.length * CHAR_W + PAD_X * 2;
    const spots: [PlacedLabel, Box][] = [
      [{ row, text, anchor: 'middle', baseline: 'top', offset: [0, 9] }, [x - w / 2, y + 6, x + w / 2, y + 6 + BOX_H]],
      [{ row, text, anchor: 'start', baseline: 'center', offset: [12, 0] }, [x + 7, y - BOX_H / 2, x + 7 + w, y + BOX_H / 2]],
      [{ row, text, anchor: 'end', baseline: 'center', offset: [-12, 0] }, [x - 7 - w, y - BOX_H / 2, x - 7, y + BOX_H / 2]],
    ];
    const spot = spots.find(([, b]) => free(b));
    if (!spot) continue;
    boxes.push(spot[1]);
    out.push(spot[0]);
  }
  return out;
}

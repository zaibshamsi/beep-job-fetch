/** Pure scaling helpers for the city columns (tested in scale.test.ts). */
import { ACCENT_DARK, ACCENT_LIGHT, mix, type RGB } from './colors.ts';

/** Height of a column with one job, as a share of the tallest column. Keeps tiny cities visible. */
export const MIN_HEIGHT = 0.07;

/**
 * Column height in 0..1 from a job count. Square-root scaling so Bengaluru does not dwarf everything;
 * any count above zero gets at least MIN_HEIGHT, zero gets 0.
 */
export function columnHeight(count: number, maxCount: number): number {
  if (!(count > 0) || !(maxCount > 0)) return 0;
  const t = Math.sqrt(Math.min(count, maxCount) / maxCount);
  return MIN_HEIGHT + (1 - MIN_HEIGHT) * t;
}

/** Column colour: same hue as the accent, lighter for small counts, darker for the biggest. */
export function columnColor(count: number, maxCount: number): RGB {
  if (!(maxCount > 0) || !(count > 0)) return ACCENT_LIGHT;
  const t = Math.sqrt(Math.min(count, maxCount) / maxCount);
  return mix(ACCENT_LIGHT, ACCENT_DARK, t);
}

/**
 * Tallest column in screen pixels: about a quarter of the map's shorter side (India is fitted to that side),
 * within 70..230 px.
 */
export function maxColumnPixels(width: number, height: number): number {
  return Math.max(70, Math.min(230, Math.min(width, height) * 0.26));
}

/** Metres per screen pixel at a zoom and latitude (Web Mercator, 512 px tiles as deck.gl uses). */
export function metersPerPixel(zoom: number, latitude: number): number {
  return (40075016.686 * Math.cos((latitude * Math.PI) / 180)) / (512 * 2 ** zoom);
}

/**
 * Job pins have no exact coordinates, so they are placed on a golden-angle (sunflower) spiral around the city centre.
 * The order on the spiral comes from a hash of the job id, so the same set of jobs always lands on the same spots and
 * neighbouring ids do not cluster. Tested in spiral.test.ts.
 */

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const METERS_PER_DEG_LAT = 111_320;

/** 32-bit integer hash (lowbias32). Deterministic, well mixed. */
export function hashId(id: number): number {
  let x = id | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Spiral radius in metres for n pins: grows with the square root of n (constant pin density), 600 m to 6.5 km. */
export function spiralRadius(n: number): number {
  if (n <= 0) return 0;
  return Math.max(600, Math.min(6500, 560 * Math.sqrt(n)));
}

/** Offset in metres [east, north] of slot i of n on the spiral. Slot 0 is nearest the centre. */
export function spiralOffset(i: number, n: number, radius: number): [number, number] {
  const r = radius * Math.sqrt((i + 0.5) / n);
  const a = i * GOLDEN_ANGLE;
  return [r * Math.cos(a), r * Math.sin(a)];
}

/** Move a [lng, lat] point by [east, north] metres. */
export function offsetLngLat(center: readonly [number, number], east: number, north: number): [number, number] {
  const lat = center[1] + north / METERS_PER_DEG_LAT;
  const lng = center[0] + east / (METERS_PER_DEG_LAT * Math.cos((center[1] * Math.PI) / 180));
  return [lng, lat];
}

export interface Placed<T> {
  item: T;
  position: [number, number];
}

/**
 * Place items with numeric ids on the spiral around center. Ties in the hash fall back to the id, so the
 * result never depends on the input order.
 */
export function placeOnSpiral<T extends { id: number }>(center: readonly [number, number], items: readonly T[]): Placed<T>[] {
  const n = items.length;
  if (n === 0) return [];
  const radius = spiralRadius(n);
  const sorted = items
    .map((item) => ({ item, h: hashId(item.id) }))
    .sort((a, b) => a.h - b.h || a.item.id - b.item.id);
  return sorted.map(({ item }, i) => {
    const [e, nn] = spiralOffset(i, n, radius);
    return { item, position: offsetLngLat(center, e, nn) };
  });
}

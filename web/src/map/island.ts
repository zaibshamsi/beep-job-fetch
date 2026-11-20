/** The "Remote" island: a small rounded landmass in the Arabian Sea standing for remote-eligible jobs. */

export const REMOTE_KEY = 'Remote';
/** Centre of the island [lng, lat]. Open sea, west of Goa and north-west of Lakshadweep. */
export const REMOTE_CENTER: [number, number] = [65.8, 16];

/** Rounded, slightly irregular outline (a closed ring of [lng, lat]), about 260 km across. */
export function remoteIslandRing(points = 56): [number, number][] {
  const [lng0, lat0] = REMOTE_CENTER;
  const rLat = 1.15; // degrees north-south
  const rLng = rLat / Math.cos((lat0 * Math.PI) / 180); // same ground distance east-west
  const ring: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    // a soft, asymmetric blob: wider than tall, a gentle bay on one side
    const k = 1 + 0.07 * Math.sin(2 * a + 0.6) + 0.05 * Math.cos(3 * a) - 0.03 * Math.sin(5 * a + 1.1);
    ring.push([+(lng0 + Math.cos(a) * rLng * 1.18 * k).toFixed(4), +(lat0 + Math.sin(a) * rLat * k).toFixed(4)]);
  }
  ring.push(ring[0]!);
  return ring;
}

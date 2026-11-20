/**
 * Map colours as deck.gl RGB(A) arrays. Mirrors web/DESIGN.md section 2 ("Saffron dusk"): land #1A1626 on the card's
 * dark gradient, state lines white at 12%, columns from #FF8A4B (few jobs) to #FF4F7B (most), rose pins.
 */
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

/** Glass panel ground (labels, tooltips): rgb(18 15 26). */
export const SEA: RGB = [18, 15, 26];
/** Land: #1A1626. */
export const LAND: RGB = [26, 22, 38];
/** State lines and the coast: white at 12% opacity (alpha is part of the colour). */
export const BORDER_LINE: RGBA = [255, 255, 255, 31];
/** Label borders: the glass hairline, opaque version of white at 15% over the glass. */
export const BORDER: RGB = [56, 53, 64];
/** --tx: label text and pin stems. */
export const INK: RGB = [244, 239, 230];
/** --tx2 */
export const MUTED: RGB = [169, 162, 182];
/** Pins and highlights: --rose #FF4F7B. */
export const ACCENT: RGB = [255, 79, 123];
/** Selected pin ring: --saf #FFB23F. */
export const SAFFRON: RGB = [255, 178, 63];
/** White pin stroke. */
export const WHITE: RGB = [255, 255, 255];

/** Smallest columns: #FF8A4B. */
export const ACCENT_LIGHT: RGB = [255, 138, 75];
/** Biggest columns: #FF4F7B. */
export const ACCENT_DARK: RGB = [255, 79, 123];

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function withAlpha(c: RGB, a: number): RGBA {
  return [c[0], c[1], c[2], Math.round(a)];
}

/**
 * Camera maths for the 2D map (pure, tested in viewbox.test.ts). A box is an SVG viewBox: [x, y, width, height]
 * in the 650 x 620 design space of design/indiaGeo.ts.
 */
import { VIEWBOX_NUMBERS } from '../../design/indiaGeo.ts';

export type Box = [number, number, number, number];
export interface Size {
  w: number;
  h: number;
}

/** The whole of India. */
export const FULL: Box = [...VIEWBOX_NUMBERS];
/** Camera move to a city (design: 900 ms ease-out quartic). */
export const FLY_MS = 900;
/** Zoom buttons, wheel and keys. */
export const STEP_MS = 320;
/** The window around a selected city, in design units. */
export const CITY_W = 150;
export const CITY_H = 140;
export const MIN_W = 60;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Ease-out quartic: fast start, long settle. */
export const easeOutQuart = (t: number): number => 1 - (1 - clamp01(t)) ** 4;

export function lerpBox(from: Box, to: Box, p: number): Box {
  return [0, 1, 2, 3].map((i) => from[i]! + (to[i]! - from[i]!) * p) as Box;
}

/** The box a tween is in after `elapsed` ms, and whether it has arrived. */
export function tweenAt(from: Box, to: Box, elapsed: number, duration = FLY_MS): { box: Box; done: boolean } {
  const t = duration <= 0 ? 1 : clamp01(elapsed / duration);
  return { box: t >= 1 ? [...to] : lerpBox(from, to, easeOutQuart(t)), done: t >= 1 };
}

/** Design units per screen pixel (the SVG uses preserveAspectRatio "meet", so the larger ratio wins). */
export function unitsPerPx(box: Box, size: Size): number {
  return Math.max(box[2] / size.w, box[3] / size.h);
}

/** How much to counter-scale beacons so they keep the same size on screen at any zoom (1 at the full view). */
export function beaconScale(box: Box, size: Size | null): number {
  if (!size || size.w <= 0 || size.h <= 0) return box[2] / FULL[2];
  return unitsPerPx(box, size) / unitsPerPx(FULL, size);
}

export interface Inset {
  left: number;
  top: number;
}

/**
 * Space on the map covered by the city panel, in px: nothing on a wide card, the 290px panel on the left on a
 * medium one, the compact strip on top on a phone.
 */
export function panelInset(size: Size | null): Inset {
  if (!size) return { left: 0, top: 0 };
  if (size.w >= 900) return { left: 0, top: 0 };
  if (size.w > 560) return { left: 330, top: 0 };
  return { left: 0, top: Math.min(240, size.h * 0.45) };
}

/**
 * The 150 x 140 window around a city. With the container size the box takes its aspect (no letterbox), and with an
 * inset (px covered by the city panel) the city is centred in the part that stays visible.
 */
export function cityBox(x: number, y: number, size?: Size | null, inset: Inset = { left: 0, top: 0 }): Box {
  if (!size || size.w <= 0 || size.h <= 0) return [x - CITY_W / 2, y - CITY_H / 2, CITY_W, CITY_H];
  const scale = Math.min(size.w / CITY_W, size.h / CITY_H); // px per unit
  const vw = size.w / scale;
  const vh = size.h / scale;
  const left = Math.min(Math.max(0, inset.left), size.w * 0.6);
  const top = Math.min(Math.max(0, inset.top), size.h * 0.5);
  const cx = left + (size.w - left) / 2; // where the city should sit, in px
  const cy = top + (size.h - top) / 2;
  return [x - cx / scale, y - cy / scale, vw, vh];
}

/**
 * Zoom by a factor (below 1 zooms in) around an anchor in design units (the box centre by default).
 * Width stays within MIN_W..FULL width; the aspect is kept.
 */
export function zoomBox(box: Box, factor: number, anchor?: [number, number]): Box {
  const [x, y, w, h] = box;
  const nw = Math.min(FULL[2], Math.max(MIN_W, w * factor));
  const f = nw / w;
  const nh = h * f;
  const [ax, ay] = anchor ?? [x + w / 2, y + h / 2];
  return [ax - (ax - x) * f, ay - (ay - y) * f, nw, nh];
}

/** Keep the centre of the box inside the map's extent so India cannot be dragged out of view. */
export function clampBox(box: Box): Box {
  const [x, y, w, h] = box;
  const cx = Math.min(FULL[0] + FULL[2], Math.max(FULL[0], x + w / 2));
  const cy = Math.min(FULL[1] + FULL[3], Math.max(FULL[1], y + h / 2));
  return [cx - w / 2, cy - h / 2, w, h];
}

export const panBox = (box: Box, dx: number, dy: number): Box => clampBox([box[0] + dx, box[1] + dy, box[2], box[3]]);

/** Screen point (px inside the SVG element) to design units under a box. */
export function pxToUnits(box: Box, size: Size, px: number, py: number): [number, number] {
  const u = unitsPerPx(box, size);
  const offX = (size.w - box[2] / u) / 2;
  const offY = (size.h - box[3] / u) / 2;
  return [box[0] + (px - offX) * u, box[1] + (py - offY) * u];
}

export const boxEquals = (a: Box, b: Box, eps = 0.01) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

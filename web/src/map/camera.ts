/** Camera maths: the all-India fit, the city focus view, pan and zoom steps. */
import { WebMercatorViewport, type MapViewState } from '@deck.gl/core';
import { metersPerPixel } from './scale.ts';
import { REMOTE_CENTER } from './island.ts';

export const INDIA_PITCH = 42;
export const INDIA_BEARING = -8;
export const FOCUS_PITCH = 50;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 16;
/**
 * Camera distance (relative to the view height). Higher than deck.gl's 1.5 for a narrower field of view, so columns
 * near the edges do not splay outwards. Shared by the MapView and every viewport we build for maths.
 */
export const CAMERA = { altitude: 2.6 } as const;

/** Convex hull of India's official boundary (from india-states.json) plus the Remote island. */
const FIT_POINTS: [number, number][] = [
  [68.1, 23.7], [72.3, 10.1], [73, 8.3], [93.8, 6.8], [97.4, 27.9], [96.4, 29.3], [80, 35.8], [75.3, 37.1],
  [73.7, 36.9], [72.6, 36.3],
  [REMOTE_CENTER[0] - 1.6, REMOTE_CENTER[1]], [REMOTE_CENTER[0], REMOTE_CENTER[1] - 1.3],
  [REMOTE_CENTER[0], REMOTE_CENTER[1] + 1.3],
];

export interface Size {
  width: number;
  height: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The part of the map not covered by the side panel, minus breathing room. */
function visibleRect({ width, height }: Size, insetLeft: number, pad: { top: number; right: number; bottom: number; left: number }): Rect {
  // Ignore an inset that would leave less than 45% of the width (the page should not pass one, but stay robust).
  const inset = insetLeft > 0 && width - insetLeft > width * 0.45 ? insetLeft : 0;
  return { x0: inset + pad.left, y0: pad.top, x1: width - pad.right, y1: height - pad.bottom };
}

function project(vs: MapViewState, size: Size, points: [number, number][]): Rect {
  const vp = new WebMercatorViewport({ ...vs, ...size, ...CAMERA });
  const r = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of points) {
    const [x, y] = vp.project(p) as [number, number];
    r.x0 = Math.min(r.x0, x);
    r.y0 = Math.min(r.y0, y);
    r.x1 = Math.max(r.x1, x);
    r.y1 = Math.max(r.y1, y);
  }
  return r;
}

/** Move the camera so the screen point (x, y) shows what (cx, cy) shows now. */
function shiftCenter(vs: MapViewState, size: Size, dx: number, dy: number): MapViewState {
  const vp = new WebMercatorViewport({ ...vs, ...size, ...CAMERA });
  const [longitude, latitude] = vp.unproject([size.width / 2 + dx, size.height / 2 + dy]) as [number, number];
  return { ...vs, longitude, latitude };
}

/** Bird's-eye view of all India at a tilt, fitted into the visible part of the map. */
export function indiaView(size: Size, insetLeft = 0): MapViewState {
  const { width, height } = size;
  const small = width < 600;
  const pad = {
    // room above the north for the columns of northern cities, below for the south tip
    top: Math.round(height * (small ? 0.06 : 0.08)),
    bottom: Math.round(height * 0.04),
    left: small ? 12 : 32,
    right: small ? 12 : 72, // keep clear of the zoom controls
  };
  const target = visibleRect(size, insetLeft, pad);
  const tw = Math.max(40, target.x1 - target.x0);
  const th = Math.max(40, target.y1 - target.y0);
  let vs: MapViewState = {
    longitude: 81,
    latitude: 21.5,
    zoom: Math.log2(Math.min(width, height) / 512) + 3,
    pitch: INDIA_PITCH,
    bearing: INDIA_BEARING,
  };
  for (let i = 0; i < 6; i++) {
    const r = project(vs, size, FIT_POINTS);
    const scale = Math.min(tw / (r.x1 - r.x0), th / (r.y1 - r.y0));
    vs = { ...vs, zoom: vs.zoom + Math.log2(scale) };
    const r2 = project(vs, size, FIT_POINTS);
    const dx = (r2.x0 + r2.x1) / 2 - (target.x0 + target.x1) / 2;
    const dy = (r2.y0 + r2.y1) / 2 - (target.y0 + target.y1) / 2;
    vs = shiftCenter(vs, size, dx, dy);
    if (Math.abs(Math.log2(scale)) < 0.002 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
  }
  return { ...vs, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };
}

/** Area the focus view shows across its shorter visible side. */
export const FOCUS_SPAN_METERS = 15_000;

/** Close-up of one city: a ~15 km area fills the visible part, pitched, the city centred right of the panel. */
export function focusView(center: readonly [number, number], size: Size, insetLeft = 0): MapViewState {
  const target = visibleRect(size, insetLeft, { top: 0, right: 0, bottom: 0, left: 0 });
  const span = Math.max(120, Math.min(target.x1 - target.x0, target.y1 - target.y0));
  const mpp = FOCUS_SPAN_METERS / span;
  const zoom = Math.log2(metersPerPixel(0, center[1]) / mpp);
  let vs: MapViewState = {
    longitude: center[0],
    latitude: center[1],
    zoom,
    pitch: FOCUS_PITCH,
    bearing: INDIA_BEARING,
  };
  // put the city at the centre of the visible rect, not of the canvas
  const dx = size.width / 2 - (target.x0 + target.x1) / 2;
  const dy = size.height / 2 - (target.y0 + target.y1) / 2;
  if (dx !== 0 || dy !== 0) vs = shiftCenter(vs, size, dx, dy);
  return { ...vs, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };
}

/** Pan by a screen offset (keyboard arrows). */
export function panBy(vs: MapViewState, size: Size, dx: number, dy: number): MapViewState {
  return shiftCenter(vs, size, dx, dy);
}

/** Zoom by a step, clamped. */
export function zoomBy(vs: MapViewState, step: number): MapViewState {
  return { ...vs, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vs.zoom + step)) };
}

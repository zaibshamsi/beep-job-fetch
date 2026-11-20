/**
 * The 3D map of fresher jobs across India (deck.gl, no basemap tiles). Implements JobMapProps from ./contract.ts.
 * Fills its positioned parent. See web/DESIGN.md for colours and motion rules.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import DeckGL from '@deck.gl/react';
import { FlyToInterpolator, LinearInterpolator, MapView, type MapViewState, type PickingInfo } from '@deck.gl/core';
import { ColumnLayer, GeoJsonLayer, LineLayer, PolygonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { ArrowLeft, LocateFixed, Minus, Plus } from 'lucide-react';
import type { JobListItem } from '../api/types.ts';
import type { JobMapProps } from './contract.ts';
import { ACCENT, BORDER, BORDER_LINE, INK, LAND, SAFFRON, SEA, WHITE, withAlpha } from './colors.ts';
import { columnColor, columnHeight, maxColumnPixels, metersPerPixel } from './scale.ts';
import { CAMERA, focusView, indiaView, panBy, zoomBy, type Size } from './camera.ts';
import { buildRows, type ColumnRow, type Registry } from './rows.ts';
import { REMOTE_KEY, remoteIslandRing } from './island.ts';
import { offsetLngLat, placeOnSpiral, spiralRadius, type Placed } from './spiral.ts';
import { LABEL_SIZE, pickLabels, type PlacedLabel } from './labels.ts';
import { glyphRenderer } from './glyphs.ts';
import './map.css';

/* ------------------------------------------------------------------ constants */

const GEO_URL = `${import.meta.env.BASE_URL}geo/india-states.json`;
const FONT_FAMILY = '"Manrope", system-ui, -apple-system, "Segoe UI", sans-serif';
const FALLBACK_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const FLY_MS = 1200;
const GROW_MS = 900;
const STEP_MS = 220;
const PIN_LIFT_M = 260; // pins float this high over the ground, on a thin stem
const MAX_PINS = 400;
const FOCUS_OTHERS_ALPHA = 64; // 25% opacity for other cities while one is in focus
const NO_LAYER_DEPTH = { depthWriteEnabled: false, depthCompare: 'always' } as const;
const CONTROLLER = { dragRotate: true, touchRotate: true, keyboard: false, inertia: 300 } as const;
const VIEW = new MapView({ id: 'map', ...CAMERA });
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const ISLAND = [{ ring: remoteIslandRing() }];
// Atlas padding; also keeps this atlas's cache key apart from any default-rendered TextLayer atlas (see glyphs.ts).
const FONT_SETTINGS = { buffer: 6 } as const;

type GeoData = { type: 'FeatureCollection'; features: unknown[] };
let geoPromise: Promise<GeoData> | null = null;
function loadGeo(): Promise<GeoData> {
  geoPromise ??= fetch(GEO_URL).then((r) => {
    if (!r.ok) throw new Error(`India boundaries failed to load (${r.status})`);
    return r.json() as Promise<GeoData>;
  });
  geoPromise.catch(() => (geoPromise = null));
  return geoPromise;
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

const getCursor = ({ isDragging, isHovering }: { isDragging: boolean; isHovering: boolean }) =>
  isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab';

type Hover = { kind: 'city'; row: ColumnRow } | { kind: 'pin'; job: JobListItem } | null;

const fmt = (n: number) => n.toLocaleString('en-IN');
const jobsLabel = (n: number) => `${fmt(n)}\u00a0${n === 1 ? 'job' : 'jobs'}`;

/* ------------------------------------------------------------------ component */

export function JobMap({
  cities,
  remoteCount,
  focusCity,
  focusJobs,
  selectedJobId,
  onFocusCity,
  onSelectJob,
  insetLeft = 0,
}: JobMapProps) {
  const [glOk] = useState(hasWebGL2);
  const [glFailed, setGlFailed] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const coarse = useMediaQuery('(pointer: coarse)');

  const rootRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [viewState, setViewState] = useState<MapViewState | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const [deckReady, setDeckReady] = useState(false);
  const [grown, setGrown] = useState(false);
  const [hover, setHover] = useState<Hover>(null);
  const hoverKey = useRef<string | null>(null);

  // Keep the callbacks fresh without re-creating layers when the page passes new closures.
  const cb = useRef({ onFocusCity, onSelectJob });
  cb.current = { onFocusCity, onSelectJob };

  /* ---- size */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w > 0 && h > 0) setSize((s) => (s && s.width === w && s.height === h ? s : { width: w, height: h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [glOk, glFailed]);

  /* ---- boundaries and font */
  useEffect(() => {
    if (!glOk) return;
    let live = true;
    loadGeo().then(
      (g) => live && setGeo(g),
      (e: unknown) => console.warn(e),
    );
    return () => {
      live = false;
    };
  }, [glOk]);

  useEffect(() => {
    let live = true;
    const fonts = document.fonts;
    if (!fonts) return;
    fonts
      .load(`500 ${LABEL_SIZE}px "Manrope"`)
      .then(() => live && setFontReady(fonts.check(`500 ${LABEL_SIZE}px "Manrope"`)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  /* ---- data: stable column rows */
  const registry = useRef<Registry>(new Map());
  const prevRows = useRef<ColumnRow[]>([]);
  const rows = useMemo(() => {
    const next = buildRows(registry.current, prevRows.current, cities, remoteCount);
    prevRows.current = next;
    return next;
  }, [cities, remoteCount]);
  const maxCount = useMemo(() => rows.reduce((m, r) => Math.max(m, r.count), 0), [rows]);
  const hasData = maxCount > 0;

  const focusRow = useMemo(() => (focusCity ? rows.find((r) => r.key === focusCity) ?? null : null), [rows, focusCity]);
  const focusLng = focusRow?.position[0];
  const focusLat = focusRow?.position[1];
  const inFocus = focusCity != null && focusLng != null && focusLat != null;

  /* ---- columns grow once, after the first frame with data */
  useEffect(() => {
    if (grown || !hasData || !deckReady) return;
    if (reducedMotion) {
      setGrown(true);
      return;
    }
    let id = requestAnimationFrame(() => (id = requestAnimationFrame(() => setGrown(true))));
    return () => cancelAnimationFrame(id);
  }, [grown, hasData, deckReady, reducedMotion]);

  /* ---- camera: India fit, focus fly-to, refit on resize */
  const cameraMode = useRef<string | null>(null);
  useEffect(() => {
    if (!size) return;
    const mode = inFocus ? `focus:${focusCity}` : 'india';
    const target = inFocus ? focusView([focusLng!, focusLat!], size, insetLeft) : indiaView(size, insetLeft);
    const first = cameraMode.current === null;
    const changed = cameraMode.current !== mode;
    cameraMode.current = mode;
    if (first || !changed || reducedMotion) {
      setViewState(target);
    } else {
      setViewState({
        ...target,
        transitionDuration: FLY_MS,
        transitionInterpolator: new FlyToInterpolator(),
        transitionEasing: easeOutCubic,
      });
    }
  }, [size, insetLeft, inFocus, focusCity, focusLng, focusLat, reducedMotion]);

  const step = useCallback(
    (fn: (vs: MapViewState) => MapViewState) => {
      setViewState((vs) => {
        if (!vs) return vs;
        const { transitionDuration: _d, transitionInterpolator: _i, transitionEasing: _e, ...rest } = vs as MapViewState & {
          transitionDuration?: number;
          transitionInterpolator?: unknown;
          transitionEasing?: unknown;
        };
        const next = fn(rest);
        return reducedMotion
          ? next
          : {
              ...next,
              transitionDuration: STEP_MS,
              transitionInterpolator: new LinearInterpolator(['longitude', 'latitude', 'zoom']),
              transitionEasing: easeOutCubic,
            };
      });
    },
    [reducedMotion],
  );

  const resetView = useCallback(() => {
    if (!size) return;
    const target = inFocus ? focusView([focusLng!, focusLat!], size, insetLeft) : indiaView(size, insetLeft);
    setViewState(
      reducedMotion
        ? target
        : { ...target, transitionDuration: 600, transitionInterpolator: new FlyToInterpolator(), transitionEasing: easeOutCubic },
    );
  }, [size, insetLeft, inFocus, focusLng, focusLat, reducedMotion]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!size || e.altKey || e.ctrlKey || e.metaKey) return;
      const d = e.shiftKey ? 240 : 100;
      switch (e.key) {
        case 'ArrowLeft':
          step((vs) => panBy(vs, size, -d, 0));
          break;
        case 'ArrowRight':
          step((vs) => panBy(vs, size, d, 0));
          break;
        case 'ArrowUp':
          step((vs) => panBy(vs, size, 0, -d));
          break;
        case 'ArrowDown':
          step((vs) => panBy(vs, size, 0, d));
          break;
        case '+':
        case '=':
          step((vs) => zoomBy(vs, 0.5));
          break;
        case '-':
        case '_':
          step((vs) => zoomBy(vs, -0.5));
          break;
        case '0':
          resetView();
          break;
        case 'Escape':
          if (!focusCity) return;
          cb.current.onFocusCity(null);
          break;
        default:
          return;
      }
      e.preventDefault();
    },
    [size, step, resetView, focusCity],
  );

  /* ---- derived view numbers (bucketed so layers only change when it matters) */
  const zoom = viewState?.zoom ?? 4;
  const lat = viewState?.latitude ?? 21;
  const elevationScale = useMemo(
    () => (size ? maxColumnPixels(size.width - insetLeft, size.height) * metersPerPixel(zoom, lat) : 1),
    [size, insetLeft, zoom, lat],
  );
  const small = (size?.width ?? 1024) < 600;
  const columnRadius = small ? 4.5 : 6;

  /* ---- hover / click */
  const showTip = useCallback(
    (key: string | null, next: Hover, x: number, y: number) => {
      if (hoverKey.current !== key) {
        hoverKey.current = key;
        setHover(next);
      }
      const el = tipRef.current;
      if (!el || !next || !size) return;
      const flipX = x > size.width - 280;
      const flipY = y > size.height - 140;
      el.style.transform =
        `translate(${Math.round(x + (flipX ? -14 : 14))}px, ${Math.round(y + (flipY ? -14 : 16))}px)` +
        ` translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`;
    },
    [size],
  );

  // The camera moved under a still pointer (drag, fly-to, keys): the hovered thing is no longer where the tip says.
  useEffect(() => {
    if (hoverKey.current !== null) {
      hoverKey.current = null;
      setHover(null);
    }
  }, [viewState, focusCity]);

  const onHover = useCallback(
    (info: PickingInfo) => {
      const id = info.layer?.id;
      const obj = info.object as unknown;
      if (id === 'city-columns' && obj) {
        const row = obj as ColumnRow;
        if (row.count > 0 && row.key !== focusCity) return showTip(`c:${row.key}`, { kind: 'city', row }, info.x, info.y);
      } else if (id === 'remote-island') {
        const row = rows.find((r) => r.isRemote);
        if (row) return showTip(`c:${REMOTE_KEY}`, { kind: 'city', row }, info.x, info.y);
      } else if (id === 'pin-heads' && obj) {
        const job = (obj as Placed<JobListItem>).item;
        return showTip(`p:${job.id}`, { kind: 'pin', job }, info.x, info.y);
      }
      showTip(null, null, 0, 0);
    },
    [focusCity, rows, showTip],
  );

  const onColumnClick = useCallback((info: PickingInfo<ColumnRow>) => {
    const row = info.object;
    if (!row || row.count <= 0) return false;
    cb.current.onFocusCity(row.isRemote ? REMOTE_KEY : row.city);
    return true;
  }, []);

  const onIslandClick = useCallback(() => {
    cb.current.onFocusCity(REMOTE_KEY);
    return true;
  }, []);

  const onPinClick = useCallback((info: PickingInfo<Placed<JobListItem>>) => {
    const p = info.object;
    if (!p) return false;
    const rect = rootRef.current?.getBoundingClientRect();
    let x = info.x;
    let y = info.y;
    if (info.viewport) {
      const pt = info.viewport.project([p.position[0], p.position[1], PIN_LIFT_M]) as [number, number];
      x = pt[0];
      y = pt[1];
    }
    cb.current.onSelectJob(p.item.id, { x: Math.round((rect?.left ?? 0) + x), y: Math.round((rect?.top ?? 0) + y) });
    return true;
  }, []);

  /* ---- pins */
  const pins = useMemo<Placed<JobListItem>[]>(() => {
    if (!inFocus) return [];
    const placed = placeOnSpiral([focusLng!, focusLat!], focusJobs.slice(0, MAX_PINS));
    // draw the selected pin last so it sits on top
    return selectedJobId == null ? placed : [...placed].sort((a, b) => Number(a.item.id === selectedJobId) - Number(b.item.id === selectedJobId));
  }, [inFocus, focusLng, focusLat, focusJobs, selectedJobId]);

  /* ---- labels (re-placed when the camera changes enough to move them relative to each other) */
  const labelKey = viewState
    ? `${zoom.toFixed(1)}|${Math.round(viewState.pitch ?? 0)}|${Math.round(viewState.bearing ?? 0)}|${lat.toFixed(0)}`
    : '';
  const vsRef = useRef(viewState);
  vsRef.current = viewState;
  const labelRows = useMemo(() => {
    if (!size || !vsRef.current || inFocus) return [];
    return pickLabels(rows, vsRef.current, size, small ? 7 : 12);
  }, [rows, size, labelKey, inFocus, small]); // labelKey stands in for the camera

  /* ---- layers */
  const landLayer = useMemo(
    () =>
      geo &&
      new GeoJsonLayer({
        id: 'india-land',
        data: geo as never,
        filled: true,
        stroked: true,
        getFillColor: LAND,
        getLineColor: BORDER_LINE,
        getLineWidth: 1,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 1,
        lineJointRounded: true,
        pickable: false,
        parameters: NO_LAYER_DEPTH,
      }),
    [geo],
  );

  const islandLayer = useMemo(
    () =>
      new PolygonLayer<{ ring: [number, number][] }>({
        id: 'remote-island',
        data: ISLAND,
        getPolygon: (d) => d.ring,
        filled: true,
        stroked: true,
        getFillColor: LAND,
        getLineColor: BORDER_LINE,
        getLineWidth: 1,
        lineWidthUnits: 'pixels',
        pickable: true,
        autoHighlight: true,
        highlightColor: withAlpha(ACCENT, 36),
        onClick: onIslandClick,
        parameters: NO_LAYER_DEPTH,
      }),
    [onIslandClick],
  );

  const columnsLayer = useMemo(
    () =>
      new ColumnLayer<ColumnRow>({
        id: 'city-columns',
        data: rows,
        diskResolution: 24,
        radius: columnRadius,
        radiusUnits: 'pixels',
        extruded: true,
        elevationScale,
        getPosition: (r) => r.position,
        getElevation: (r) => {
          if (!grown || r.count <= 0 || (inFocus && r.key === focusCity)) return 0;
          return columnHeight(r.count, maxCount) * (inFocus ? 0.5 : 1);
        },
        getFillColor: (r) => {
          const c = columnColor(r.count, maxCount);
          if (r.count <= 0 || (inFocus && r.key === focusCity)) return withAlpha(c, 0);
          return withAlpha(c, inFocus ? FOCUS_OTHERS_ALPHA : 255);
        },
        material: { ambient: 0.7, diffuse: 0.55, shininess: 24, specularColor: [90, 60, 70] },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 72],
        onClick: onColumnClick,
        transitions: reducedMotion
          ? undefined
          : {
              getElevation: { duration: GROW_MS, easing: easeOutCubic, enter: () => [0] },
              getFillColor: { duration: 400, easing: easeOutCubic },
            },
        updateTriggers: {
          getElevation: [grown, maxCount, inFocus, focusCity],
          getFillColor: [maxCount, inFocus, focusCity],
        },
      }),
    [rows, columnRadius, elevationScale, grown, inFocus, focusCity, maxCount, reducedMotion, onColumnClick],
  );

  const labelsLayer = useMemo(
    () =>
      new TextLayer<PlacedLabel>({
        id: 'city-labels',
        data: labelRows,
        getPosition: (l) => l.row.position,
        getText: (l) => l.text,
        getSize: LABEL_SIZE,
        sizeUnits: 'pixels',
        getColor: INK,
        getTextAnchor: (l) => l.anchor,
        getAlignmentBaseline: (l) => l.baseline,
        getPixelOffset: (l) => l.offset,
        fontFamily: fontReady ? FONT_FAMILY : FALLBACK_FONT,
        fontWeight: 500,
        characterSet: 'auto',
        background: true,
        getBackgroundColor: withAlpha(SEA, 235),
        getBorderColor: withAlpha(BORDER, 255),
        getBorderWidth: 1,
        fontSettings: FONT_SETTINGS,
        _getFontRenderer: glyphRenderer,
        backgroundPadding: [5, 3],
        backgroundBorderRadius: 5,
        parameters: NO_LAYER_DEPTH,
        pickable: false,
      }),
    [labelRows, fontReady],
  );

  const stemLayer = useMemo(
    () =>
      new LineLayer<Placed<JobListItem>>({
        id: 'pin-stems',
        data: pins,
        getSourcePosition: (p) => [p.position[0], p.position[1], 0],
        getTargetPosition: (p) => [p.position[0], p.position[1], PIN_LIFT_M],
        getColor: withAlpha(INK, 110),
        getWidth: 1.25,
        widthUnits: 'pixels',
        pickable: false,
      }),
    [pins],
  );

  const pinLayer = useMemo(
    () =>
      new ScatterplotLayer<Placed<JobListItem>>({
        id: 'pin-heads',
        data: pins,
        billboard: true,
        getPosition: (p) => [p.position[0], p.position[1], PIN_LIFT_M],
        radiusUnits: 'pixels',
        getRadius: (p) => (p.item.id === selectedJobId ? 9 : coarse ? 7 : 6),
        filled: true,
        stroked: true,
        getFillColor: ACCENT,
        getLineColor: (p) => (p.item.id === selectedJobId ? SAFFRON : WHITE),
        lineWidthUnits: 'pixels',
        getLineWidth: (p) => (p.item.id === selectedJobId ? 2.5 : 1.5),
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 90],
        onClick: onPinClick,
        parameters: NO_LAYER_DEPTH,
        updateTriggers: { getRadius: [selectedJobId, coarse], getLineColor: selectedJobId, getLineWidth: selectedJobId },
      }),
    [pins, selectedJobId, coarse, onPinClick],
  );

  /* ---- focus area: a faint ring round the pins and the city's name above it */
  const focusArea = useMemo(() => {
    if (!inFocus) return null;
    const center: [number, number] = [focusLng!, focusLat!];
    const radius = spiralRadius(Math.max(1, Math.min(focusJobs.length, MAX_PINS))) + 450;
    const name = focusCity === REMOTE_KEY ? 'Remote' : focusCity!;
    const count = focusRow?.count ?? 0;
    return {
      center,
      radius,
      labelAt: offsetLngLat(center, 0, radius + 250),
      text: count > 0 ? `${name} \u00b7 ${jobsLabel(count).replace('\u00a0', ' ')}` : name,
    };
  }, [inFocus, focusLng, focusLat, focusJobs.length, focusCity, focusRow?.count]);

  const focusRingLayer = useMemo(
    () =>
      focusArea &&
      new ScatterplotLayer<typeof focusArea>({
        id: 'focus-ring',
        data: [focusArea],
        getPosition: (d) => d.center,
        getRadius: (d) => d.radius,
        radiusUnits: 'meters',
        filled: true,
        stroked: true,
        getFillColor: withAlpha(ACCENT, 14),
        getLineColor: withAlpha(ACCENT, 110),
        lineWidthUnits: 'pixels',
        getLineWidth: 1,
        pickable: false,
        parameters: NO_LAYER_DEPTH,
      }),
    [focusArea],
  );

  const focusLabelLayer = useMemo(
    () =>
      focusArea &&
      new TextLayer<typeof focusArea>({
        id: 'focus-label',
        data: [focusArea],
        getPosition: (d) => d.labelAt,
        getText: (d) => d.text,
        getSize: 14,
        sizeUnits: 'pixels',
        getColor: INK,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        fontFamily: fontReady ? FONT_FAMILY : FALLBACK_FONT,
        fontWeight: 500,
        characterSet: 'auto',
        background: true,
        getBackgroundColor: withAlpha(SEA, 245),
        getBorderColor: withAlpha(BORDER, 255),
        getBorderWidth: 1,
        fontSettings: FONT_SETTINGS,
        _getFontRenderer: glyphRenderer,
        backgroundPadding: [8, 5],
        backgroundBorderRadius: 6,
        parameters: NO_LAYER_DEPTH,
        pickable: false,
      }),
    [focusArea, fontReady],
  );

  const layers = useMemo(
    () => [landLayer, islandLayer, focusRingLayer, columnsLayer, stemLayer, pinLayer, labelsLayer, focusLabelLayer],
    [landLayer, islandLayer, focusRingLayer, columnsLayer, stemLayer, pinLayer, labelsLayer, focusLabelLayer],
  );

  const dpr = useMemo(() => Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1), []);

  /* ---- words */
  const cityCount = useMemo(() => rows.filter((r) => !r.isRemote && r.count > 0).length, [rows]);
  const liveText = focusCity
    ? `${focusCity === REMOTE_KEY ? 'Remote jobs' : focusCity} in focus: ${jobsLabel(focusRow?.count ?? 0)}${
        pins.length ? `, ${fmt(pins.length)} shown as pins` : ''
      }.`
    : hasData
      ? `All India: jobs in ${fmt(cityCount)} ${cityCount === 1 ? 'city' : 'cities'}${
          remoteCount > 0 ? `, ${jobsLabel(remoteCount)} remote` : ''
        }.`
      : '';

  if (!glOk || glFailed) {
    return (
      <div className="jm-root">
        <p className="jm-nogl" role="status">
          The 3D map needs WebGL, which is turned off or not supported in this browser. The job list still works.
        </p>
      </div>
    );
  }

  return (
    <div className="jm-root" ref={rootRef}>
      <div
        className="jm-canvas"
        role="application"
        tabIndex={0}
        aria-roledescription="3D map"
        aria-label={`Map of fresher jobs across India. Columns rise from each city by its number of jobs; the island off the west coast holds remote jobs. ${
          focusCity ? 'Pins around the city are single jobs. ' : ''
        }Arrow keys pan, plus and minus zoom, 0 resets the view${focusCity ? ', Escape returns to all India' : ''}.`}
        onKeyDown={onKeyDown}
        onMouseLeave={() => showTip(null, null, 0, 0)}
      >
        {size && viewState && (
          <DeckGL
            views={VIEW}
            viewState={viewState}
            onViewStateChange={({ viewState: vs }) => setViewState(vs as MapViewState)}
            controller={CONTROLLER}
            layers={layers}
            getCursor={getCursor}
            onHover={onHover}
            pickingRadius={coarse ? 10 : 4}
            useDevicePixels={dpr}
            onLoad={() => setDeckReady(true)}
            onError={(err) => {
              if (!deckReady) setGlFailed(true);
              console.warn(err);
            }}
          />
        )}
      </div>

      <div ref={tipRef} className="jm-tip" hidden={!hover} aria-hidden="true">
        {hover?.kind === 'city' && (
          <>
            <div className="jm-tip__title">{hover.row.isRemote ? 'Remote' : hover.row.city}</div>
            <div className="jm-tip__count">
              {jobsLabel(hover.row.count)}
              {hover.row.isRemote ? ' you can do from anywhere' : ''}
            </div>
            {hover.row.topRoles.length > 0 && (
              <ul className="jm-tip__roles">
                {hover.row.topRoles.slice(0, 3).map((r) => (
                  <li key={r.role}>
                    <span>{r.role}</span>
                    <span className="jm-tip__n">{fmt(r.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {hover?.kind === 'pin' && (
          <>
            <div className="jm-tip__title">{hover.job.title}</div>
            <div className="jm-tip__count">{hover.job.company}</div>
          </>
        )}
      </div>

      {focusCity && (
        <button
          type="button"
          className="btn btn--secondary btn--sm jm-back"
          style={{ left: insetLeft + (small ? 12 : 16) }}
          onClick={() => cb.current.onFocusCity(null)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to all India
        </button>
      )}

      <div className="jm-controls" role="group" aria-label="Map view">
        <button type="button" aria-label="Zoom in" onClick={() => step((vs) => zoomBy(vs, 0.75))}>
          <Plus size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => step((vs) => zoomBy(vs, -0.75))}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label={focusCity ? `Reset view to ${focusCity}` : 'Reset view to all India'} onClick={resetView}>
          <LocateFixed size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="visually-hidden" role="status" aria-live="polite">
        {liveText}
      </div>
    </div>
  );
}

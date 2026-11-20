import { Focus, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { project, useIndiaShape } from '../../design/indiaGeo.ts';
import { GROUP_COLOR } from '../../design/roleGroups.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';
import { formatNumber } from '../jobs/format.ts';
import { arcLayout, arcRadius } from './arcs.ts';
import { pickLabels } from './labels.ts';
import type { FamilyCount } from './families.ts';
import { beaconScale, cityBox, FLY_MS, FULL, panBox, panelInset, pxToUnits, STEP_MS, tweenAt, zoomBox } from './viewbox.ts';
import type { Box, Size } from './viewbox.ts';

export interface BaseCity {
  city: string;
  lat: number;
  lng: number;
}

interface Props {
  /** Every city that can hold a beacon (unfiltered list), so cities without jobs under a filter can fade. */
  cities: BaseCity[];
  /** Jobs per city under the current filters. */
  counts: Map<string, number>;
  /** City in focus, 'Remote' or null. */
  focus: string | null;
  /** Family split of the focused city, biggest first. */
  families: FamilyCount[];
  /** Highlighted family (local state of the page). */
  fam: RoleGroup | null;
  onToggleFam: (g: RoleGroup) => void;
  /** Select a city (click, Enter) or null for all India (Reset). */
  onSelect: (city: string | null) => void;
  /** The city panel is open, so the camera centres the city in the part of the map it leaves free. */
  panelOpen: boolean;
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const radiusFor = (n: number) => (n > 0 ? 4 + Math.sqrt(n) * 1.6 : 2.5);
const jobsLabel = (n: number) => `${formatNumber(n)} ${n === 1 ? 'job' : 'jobs'}`;

/**
 * The 2D map: the real India outline (design/indiaGeo.ts) in the design's 650 x 620 viewBox, glowing beacons sized by
 * job count, a camera that tweens to the selected city, arcs per role family around it. The camera is moved
 * imperatively (one attribute write per frame) so React does not re-render on every animation frame.
 */
export function IndiaMap2D({ cities, counts, focus, families, fam, onToggleFam, onSelect, panelOpen }: Props) {
  const shape = useIndiaShape();
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const patRef = useRef<SVGPatternElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<Box>([...FULL]);
  const sizeRef = useRef<Size | null>(null);
  const raf = useRef(0);
  const moved = useRef(0);
  const manual = useRef(false);
  const prevFocus = useRef<string | null | undefined>(undefined);
  const [size, setSize] = useState<Size | null>(null);
  const [hover, setHover] = useState<{ city: string; n: number } | null>(null);
  const hoverKey = useRef<string | null>(null);

  /* ---------------------------------------------------------------- camera */
  const apply = useCallback((box: Box) => {
    boxRef.current = box;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setAttribute('viewBox', box.map((n) => +n.toFixed(3)).join(' '));
    const k = beaconScale(box, sizeRef.current);
    svg.style.setProperty('--k', String(k));
    const pat = patRef.current;
    const dot = dotRef.current;
    if (pat && dot) {
      pat.setAttribute('width', String(7 * k));
      pat.setAttribute('height', String(7 * k));
      dot.setAttribute('r', String(k));
      dot.setAttribute('cx', String(1.5 * k));
      dot.setAttribute('cy', String(1.5 * k));
    }
  }, []);

  const flyTo = useCallback(
    (to: Box, duration = FLY_MS) => {
      cancelAnimationFrame(raf.current);
      if (reduced() || duration <= 0) {
        apply(to);
        return;
      }
      const from = [...boxRef.current] as Box;
      const t0 = performance.now();
      const frame = (now: number) => {
        const { box, done } = tweenAt(from, to, now - t0, duration);
        apply(box);
        if (!done) raf.current = requestAnimationFrame(frame);
      };
      raf.current = requestAnimationFrame(frame);
    },
    [apply],
  );
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { w: Math.round(r.width), h: Math.round(r.height) };
      if (next.w <= 0 || next.h <= 0) return;
      sizeRef.current = next;
      setSize((s) => (s && s.w === next.w && s.h === next.h ? s : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------------------------------------------------------------- beacons */
  const beacons = useMemo(
    () =>
      cities.map((c) => {
        const [x, y] = project(c.lat, c.lng);
        const n = counts.get(c.city) ?? 0;
        return { city: c.city, x, y, n, r: radiusFor(n) };
      }),
    [cities, counts],
  );
  const labelled = useMemo(() => pickLabels(beacons), [beacons]);
  // Only the biggest beacons pulse: every animated SVG element repaints the map each frame.
  const pulsing = useMemo(() => new Set([...beacons].sort((a, b) => b.n - a.n).slice(0, 6).filter((b) => b.n > 0).map((b) => b.city)), [beacons]);
  const focusBeacon = focus ? beacons.find((b) => b.city === focus) : undefined;
  const fx = focusBeacon?.x;
  const fy = focusBeacon?.y;
  const focusKey = focusBeacon ? focus : null;
  const inset = useMemo(() => (panelOpen ? panelInset(size) : { left: 0, top: 0 }), [panelOpen, size]);

  // Fly to the focused city, or back to all India. A deep link jumps; a resize only re-fits.
  useEffect(() => {
    if (!size) return;
    sizeRef.current = size;
    const target = fx != null && fy != null ? cityBox(fx, fy, size, inset) : [...FULL] as Box;
    const first = prevFocus.current === undefined;
    const changed = prevFocus.current !== focusKey;
    prevFocus.current = focusKey;
    if (changed) manual.current = false;
    if (first) apply(target);
    else if (changed) flyTo(target);
    else if (!manual.current) apply(target);
    else apply(boxRef.current);
  }, [size, focusKey, fx, fy, inset.left, inset.top, apply, flyTo]);

  const zoom = (factor: number, anchor?: [number, number]) => {
    manual.current = true;
    flyTo(zoomBox(boxRef.current, factor, anchor), STEP_MS);
  };
  const resetView = () => {
    manual.current = false;
    if (focus) onSelect(null);
    else flyTo([...FULL] as Box);
  };

  /* ---------------------------------------------------------------- pan, wheel, keys */
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, box: [...boxRef.current] as Box };
    moved.current = 0;
    const onMove = (ev: PointerEvent) => {
      const s = sizeRef.current;
      if (!s) return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      moved.current = Math.hypot(dx, dy);
      if (moved.current < 4) return;
      cancelAnimationFrame(raf.current);
      manual.current = true;
      const u = Math.max(start.box[2] / s.w, start.box[3] / s.h);
      apply(panBox(start.box, -dx * u, -dy * u));
      tipOff();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = sizeRef.current;
      const r = svg.getBoundingClientRect();
      const anchor = s ? pxToUnits(boxRef.current, s, e.clientX - r.left, e.clientY - r.top) : undefined;
      manual.current = true;
      flyTo(zoomBox(boxRef.current, e.deltaY > 0 ? 1.15 : 0.87, anchor), 220);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [flyTo]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const [, , w, h] = boxRef.current;
    const step = e.shiftKey ? 0.3 : 0.12;
    const pan = (dx: number, dy: number) => {
      manual.current = true;
      flyTo(panBox(boxRef.current, dx * w * step, dy * h * step), 200);
    };
    switch (e.key) {
      case 'ArrowLeft':
        pan(-1, 0);
        break;
      case 'ArrowRight':
        pan(1, 0);
        break;
      case 'ArrowUp':
        pan(0, -1);
        break;
      case 'ArrowDown':
        pan(0, 1);
        break;
      case '+':
      case '=':
        zoom(0.7);
        break;
      case '-':
      case '_':
        zoom(1.4);
        break;
      case '0':
        resetView();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- tooltip */
  const tipOff = () => {
    if (hoverKey.current !== null) {
      hoverKey.current = null;
      setHover(null);
    }
  };
  const tipAt = (city: string, n: number, ev: ReactPointerEvent) => {
    if (moved.current > 4 && ev.buttons) return;
    if (hoverKey.current !== city) {
      hoverKey.current = city;
      setHover({ city, n });
    }
    const stage = stageRef.current;
    const tip = tipRef.current;
    if (!stage || !tip) return;
    const r = stage.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const y = ev.clientY - r.top;
    const flip = x > r.width - 200;
    tip.style.transform = `translate(${Math.round(flip ? x - 16 : x + 16)}px, ${Math.round(y + 16)}px)${flip ? ' translateX(-100%)' : ''}`;
  };

  const select = (city: string) => {
    if (moved.current > 4) return;
    if (city !== focus) onSelect(city);
  };

  const arcs = useMemo(
    () => (focusBeacon ? arcLayout(families.map((f) => ({ key: f.group, count: f.count })), arcRadius(focusBeacon.r)) : []),
    [focusBeacon, families],
  );

  return (
    <div
      ref={stageRef}
      className="m2"
      tabIndex={0}
      role="application"
      aria-roledescription="map"
      aria-label="Map of fresher jobs across India. Each glowing beacon is a city, sized by its open jobs. Arrow keys pan, plus and minus zoom, 0 shows all India, Escape goes back."
      onKeyDown={onKeyDown}
      onPointerLeave={tipOff}
    >
      <svg ref={svgRef} className="m2__svg" viewBox={FULL.join(' ')} preserveAspectRatio="xMidYMid meet" onPointerDown={onPointerDown}>
        <defs>
          <pattern ref={patRef} id="m2-dt" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle ref={dotRef} cx="1.5" cy="1.5" r="1" fill="#fff" opacity=".14" />
          </pattern>
          <linearGradient id="m2-st" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFB23F" />
            <stop offset=".5" stopColor="#FF4F7B" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
          <radialGradient id="m2-ht">
            <stop offset="0" stopColor="#FF4F7B" stopOpacity=".5" />
            <stop offset=".4" stopColor="#FFB23F" stopOpacity=".16" />
            <stop offset="1" stopColor="#FFB23F" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="m2-cr" cx=".35" cy=".35">
            <stop offset="0" stopColor="#FFE2B0" />
            <stop offset=".45" stopColor="#FFB23F" />
            <stop offset="1" stopColor="#FF4F7B" />
          </radialGradient>
        </defs>

        {shape.data && (
          <g className="m2__land" aria-hidden="true">
            <path d={shape.data.all} fill="rgba(139,92,246,.07)" />
            <path d={shape.data.all} fill="url(#m2-dt)" />
            {shape.data.states.map((s) => (
              <path key={s.name} d={s.d} className="m2__state" />
            ))}
            <path d={shape.data.all} className="m2__coast" stroke="url(#m2-st)" />
          </g>
        )}

        <g className="m2__beacons">
          {beacons.map((b, i) => {
            const sel = b.city === focus;
            const show = b.n > 0 && ((!focus && labelled.has(b.city)) || sel);
            const cls = ['m2-bc', b.n === 0 && 'is-zero', focus && !sel && 'is-dim', sel && 'is-sel', show && 'is-show'].filter(Boolean).join(' ');
            return (
              <g
                key={b.city}
                className={cls}
                transform={`translate(${b.x.toFixed(2)} ${b.y.toFixed(2)})`}
                role="button"
                tabIndex={b.n > 0 ? 0 : -1}
                aria-label={`${b.city}, ${jobsLabel(b.n)}`}
                aria-pressed={sel}
                aria-disabled={b.n === 0 || undefined}
                onClick={() => select(b.city)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (b.city !== focus) onSelect(b.city);
                  }
                }}
                onPointerEnter={(e) => tipAt(b.city, b.n, e)}
                onPointerMove={(e) => tipAt(b.city, b.n, e)}
                onPointerLeave={tipOff}
              >
                <g className="m2-k">
                  <g className="m2-bs" style={{ animationDelay: `${0.2 + Math.min(i, 24) * 0.05}s` }}>
                    <circle className="m2-hit" r={Math.max(b.r * 1.25, 15)} />
                    <circle className="m2-heat" r={b.r * 3.2} fill="url(#m2-ht)" />
                    {(pulsing.has(b.city) || sel) && <circle className="m2-rip" r={b.r} style={{ animationDelay: `${(i % 6) * 0.45}s` }} />}
                    <circle className="m2-core" r={b.r} fill="url(#m2-cr)" />
                    <text className="m2-lb" y={-b.r - 9}>
                      {b.city} <tspan>{b.n}</tspan>
                    </text>
                  </g>
                </g>
              </g>
            );
          })}
        </g>

        {focusBeacon && arcs.length > 0 && (
          <g key={focusBeacon.city} transform={`translate(${focusBeacon.x.toFixed(2)} ${focusBeacon.y.toFixed(2)})`} aria-hidden="true">
            <g className="m2-k">
              <g className={`m2-arcs${fam ? ' is-f' : ''}`}>
                {arcs.map((a, i) => {
                  const group = a.key as RoleGroup;
                  return (
                    <g key={a.key}>
                      <path
                        d={a.d}
                        className={fam === group ? 'is-on' : undefined}
                        stroke={GROUP_COLOR[group]}
                        style={{ strokeDasharray: a.len, strokeDashoffset: 0, '--len': a.len, animationDelay: `${60 + i * 120}ms` } as CSSProperties}
                        onClick={() => {
                          if (moved.current <= 4) onToggleFam(group);
                        }}
                      />
                      <text x={a.labelX.toFixed(1)} y={a.labelY.toFixed(1)} textAnchor={a.anchor}>
                        {a.key} <tspan>{a.count}</tspan>
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </g>
        )}
      </svg>

      <div ref={tipRef} className={`m2__tip glass${hover ? ' is-on' : ''}`} aria-hidden="true">
        {hover && (
          <>
            <b>{hover.city}</b>
            <span>
              {jobsLabel(hover.n)} · {hover.city === focus ? 'selected' : hover.n > 0 ? 'click to explore' : 'none right now'}
            </span>
          </>
        )}
      </div>

      <div className="m2__zoom glass" role="group" aria-label="Map zoom">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(0.7)}>
          <Plus size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(1.4)}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Reset view to all India" onClick={resetView}>
          <Focus size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

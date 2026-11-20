import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useIndiaShape, VIEWBOX } from '../../design/indiaGeo.ts';
import { project } from '../../design/indiaGeo.ts';
import type { CitySummary } from '../../api/types.ts';
import { sourceName } from '../jobs/sources.ts';
import { useLandingCities, useStipendInternships } from './data.ts';
import { beaconRadius, fmtNum, formatStipendShort, labelledCities } from './format.ts';
import { useReducedMotion } from './hooks.ts';

const TILT = 18;
/** Only the biggest beacons pulse: every animated SVG element forces a repaint each frame. */
const RIPPLES = 6;

function IndiaSvg({ cities }: { cities: CitySummary[] }) {
  const shape = useIndiaShape();
  const labelled = useMemo(() => labelledCities(cities), [cities]);
  const beacons = useMemo(
    () => cities.filter((c) => c.count > 0).map((c) => ({ ...c, xy: project(c.lat, c.lng), r: beaconRadius(c.count) })),
    [cities],
  );
  const states = useMemo(() => shape.data?.states.map((s) => <path key={s.name} className="ld-state" d={s.d} />), [shape.data]);

  return (
    <>
    {/* Static base: outline, state lines, dotted texture. Its own layer, so the animated beacons never repaint it. */}
    <svg className="ld-base" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <pattern id="ld-dt" width="7" height="7" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="1" fill="#fff" opacity=".14" />
        </pattern>
        <linearGradient id="ld-st" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB23F" />
          <stop offset=".5" stopColor="#FF4F7B" />
          <stop offset="1" stopColor="#8B5CF6" />
        </linearGradient>
        {shape.data && (
          <mask id="ld-out" maskUnits="userSpaceOnUse" x="-30" y="-20" width="650" height="620">
            <rect x="-30" y="-20" width="650" height="620" fill="#fff" />
            <path d={shape.data.all} fill="#000" />
          </mask>
        )}
      </defs>
      {shape.data && (
        <g aria-hidden="true">
          <path d={shape.data.all} fill="#8B5CF6" fillOpacity=".07" />
          <path d={shape.data.all} fill="url(#ld-dt)" />
          {states}
          {/* gradient outline: stroke the union, keep only the half outside the land so state borders stay subtle */}
          <path className="ld-outline" d={shape.data.all} stroke="url(#ld-st)" mask="url(#ld-out)" />
        </g>
      )}
    </svg>
    <svg className="ld-beacons" viewBox={VIEWBOX} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of India. Each glowing beacon is a city with fresher jobs; a bigger beacon means more jobs.">
      <defs>
        <radialGradient id="ld-ht">
          <stop offset="0" stopColor="#FF4F7B" stopOpacity=".5" />
          <stop offset=".4" stopColor="#FFB23F" stopOpacity=".16" />
          <stop offset="1" stopColor="#FFB23F" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ld-cr" cx=".35" cy=".35">
          <stop offset="0" stopColor="#FFE2B0" />
          <stop offset=".45" stopColor="#FFB23F" />
          <stop offset="1" stopColor="#FF4F7B" />
        </radialGradient>
      </defs>
      <g aria-hidden="true">
        {beacons.map((b, i) => (
          <g key={b.city} className={`ld-bc${labelled.has(b.city) ? ' show' : ''}`} transform={`translate(${b.xy[0].toFixed(1)} ${b.xy[1].toFixed(1)})`}>
            <g className="ld-bs" style={{ animationDelay: `${0.2 + Math.min(i, 24) * 0.05}s` }}>
              <circle r={b.r * 3.2} fill="url(#ld-ht)" />
              {i < RIPPLES && <circle className="ld-rip" r={b.r} style={{ animationDelay: `${(i % 6) * 0.45}s` }} />}
              <circle className="ld-core" r={b.r} fill="url(#ld-cr)" />
              <text className="ld-lb" y={-b.r - 9}>
                {b.city} <tspan>{b.count}</tspan>
              </text>
            </g>
          </g>
        ))}
      </g>
    </svg>
    </>
  );
}

/** Floating glass cards over the stage; each hides if its request fails, never shows a made-up number. */
function TopCityCard({ cities, loading, error }: { cities: CitySummary[]; loading: boolean; error: boolean }) {
  if (error) return null;
  if (loading) return <div className="ld-fc ld-fc-1 ld-fc-sk ld-sk" aria-hidden="true" />;
  const top = [...cities].sort((a, b) => b.count - a.count)[0];
  if (!top) return null;
  return (
    <div className="ld-fc ld-fc-1 glass--flat">
      <span className="eb" style={{ margin: 0 }}>
        {top.city}
      </span>
      <b className="mono g ld-fc-big">{fmtNum(top.count)}</b>
      <span className="mut">open roles today</span>
    </div>
  );
}

function JobCard() {
  const q = useStipendInternships();
  if (q.isError) return null;
  if (q.isPending) return <div className="ld-fc ld-fc-2 ld-fc-sk ld-sk" style={{ width: 270, height: 150 }} aria-hidden="true" />;
  const job = q.data.items[0];
  if (!job) return null;
  const stipend = formatStipendShort(job.stipendMinMonthlyInr, job.stipendMaxMonthlyInr);
  const src = job.sources[0] ? sourceName(job.sources[0].source, job.company) : null;
  return (
    <div className="ld-fc ld-fc-2 glass--flat">
      <span className="new" style={{ alignSelf: 'flex-start' }}>
        Internship
      </span>
      <b className="ld-fc-title">{job.title}</b>
      <span className="mut">
        {job.company}
        {stipend ? ` · ${stipend}` : ''}
      </span>
      <Link className="ld-mini-b" to={`/map?job=${job.id}`}>
        {src ? `Apply on ${src}` : 'See this job'} →
      </Link>
    </div>
  );
}

function StipendCard() {
  const q = useStipendInternships();
  if (q.isError) return null;
  if (q.isPending) return <div className="ld-fc ld-fc-3 ld-fc-sk ld-sk" style={{ width: 210, height: 110 }} aria-hidden="true" />;
  return (
    <div className="ld-fc ld-fc-3 glass--flat">
      <span className="mut">
        <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--saf)', verticalAlign: '-2px' }} /> internships with stipend
      </span>
      <div className="chips">
        <span className="chip on">Internship</span>
        <span className="chip on">With stipend</span>
      </div>
      <span className="mut">{fmtNum(q.data.total)} roles · newest first</span>
    </div>
  );
}

export function Stage() {
  const cities = useLandingCities();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  // The stage starts tilted and flattens as the page scrolls (reduced motion: stays at its resting tilt).
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = TILT;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const rx = Math.max(0, TILT - window.scrollY / 22);
        if (rx === last) return; // already flat: nothing to do for the rest of the page
        last = rx;
        ref.current?.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const list = cities.data?.cities ?? [];
  return (
    <div className="ld-stage" ref={ref}>
      <IndiaSvg cities={list} />
      <TopCityCard cities={list} loading={cities.isPending} error={cities.isError} />
      <JobCard />
      <StipendCard />
    </div>
  );
}

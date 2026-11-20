import { useLandingStats } from './data.ts';
import { cityBars, formatIst, qualityLine, sourcesWithJobs, fmtNum } from './format.ts';
import { CountUp, ErrorNote, SectionHead, useReveal } from './parts.tsx';
import type { ReactNode } from 'react';
import type { Stats } from '../../api/types.ts';

function Stat({ label, delay, gradient, children }: { label: string; delay: number; gradient?: boolean; children: (seen: boolean) => ReactNode }) {
  const r = useReveal<HTMLDivElement>(delay);
  return (
    <div ref={r.ref} className={`ld-stat spot ${r.cls}`} style={r.style}>
      <span>{label}</span>
      {/* the value is rendered by the caller, with `seen` so counters start when the card scrolls into view */}
      <b className={gradient ? 'g' : undefined}>{children(r.seen)}</b>
    </div>
  );
}

function Stats4({ stats, loading }: { stats?: Stats; loading: boolean }) {
  const at = formatIst(stats?.lastRun?.finishedAt);
  const val = (n: number | undefined) => (seen: boolean) => (loading || n == null ? <span className="ld-sk ld-stat-sk" aria-hidden="true" /> : <CountUp value={n} active={seen} />);
  return (
    <div className="ld-stats">
      <Stat label="Jobs on the map" delay={0}>
        {val(stats?.totals.activeJobs)}
      </Stat>
      <Stat label="New in the last 24 hours" delay={0.08} gradient>
        {val(stats?.totals.newToday)}
      </Stat>
      <Stat label="Sources with jobs" delay={0.16}>
        {val(stats ? sourcesWithJobs(stats.sources) : undefined)}
      </Stat>
      <Stat label={at ? `Last refresh, ${at.date}` : 'Last refresh'} delay={0.24}>
        {() => (loading ? <span className="ld-sk ld-stat-sk" aria-hidden="true" /> : at ? at.time : '–')}
      </Stat>
    </div>
  );
}

function CityBars({ stats, loading, error, retry }: { stats?: Stats; loading: boolean; error: boolean; retry: () => void }) {
  const r = useReveal<HTMLDivElement>();
  const bars = stats ? cityBars(stats.totals.byCity, 8) : [];
  return (
    <div ref={r.ref} className={`card ${r.cls}`} style={r.style}>
      <div className="ld-ch">
        <h3>Jobs by city</h3>
        <span className="mut">Top 8 of today’s map</span>
      </div>
      {loading ? (
        <div aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="ld-sk ld-cb-sk" />
          ))}
        </div>
      ) : error ? (
        <ErrorNote what="The city numbers" onRetry={retry} />
      ) : bars.length === 0 ? (
        <p className="mut">No city has jobs yet.</p>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {bars.map((b) => (
            <li key={b.city} className="ld-cb">
              <span>{b.city}</span>
              <span className="t" aria-hidden="true">
                <i style={{ width: `${r.seen ? b.pct : 0}%` }} />
              </span>
              <b>{fmtNum(b.count)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Numbers() {
  const q = useLandingStats();
  const note = useReveal<HTMLParagraphElement>();
  const quality = q.data ? qualityLine(q.data) : null;
  return (
    <section className="ld-sec" id="numbers">
      <SectionHead eyebrow="04 · Numbers" text="Read from the API as this page loads.">
        Numbers from <em className="serif g">the last run</em>
      </SectionHead>
      {q.isError ? (
        <div className="card">
          <ErrorNote what="The numbers" onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <div className="ld-nums">
          <Stats4 stats={q.data} loading={q.isPending} />
          <CityBars stats={q.data} loading={q.isPending} error={false} retry={() => void q.refetch()} />
        </div>
      )}
      <p ref={note.ref} className={`ld-note ${note.cls}`} style={note.style}>
        {quality ?? 'Cost per 1,000 posts: shown once the numbers load.'}
      </p>
    </section>
  );
}

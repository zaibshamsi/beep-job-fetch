import { Link } from 'react-router-dom';
import { useLandingStats } from './data.ts';
import { formatIst } from './format.ts';
import { CountUp, useReveal } from './parts.tsx';
import { Stage } from './Stage.tsx';

/** Mounted only once data (or an error) is known, so its reveal observer attaches to a real element. */
function PillLink({ jobs, updated }: { jobs: number | null; updated: string | null }) {
  const r = useReveal<HTMLAnchorElement>();
  return (
    <Link ref={r.ref} to="/map" className={`pill ld-pill ${r.cls}`} style={r.style}>
      {jobs == null ? (
        <span>Live job numbers are unavailable right now</span>
      ) : (
        <>
          <span className="pd" aria-hidden="true" />
          <span>
            <b className="mono">
              <CountUp value={jobs} active={r.seen} />
            </b>{' '}
            fresher jobs live{updated ? ` · updated ${updated}` : ''}
          </span>
        </>
      )}
      <span className="ar" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

function LivePill() {
  const stats = useLandingStats();
  if (stats.isPending) return <span className="ld-pill ld-pill-sk ld-sk" aria-hidden="true" />;
  if (stats.isError || !stats.data) return <PillLink jobs={null} updated={null} />;
  const at = formatIst(stats.data.lastRun?.finishedAt);
  return <PillLink jobs={stats.data.totals.activeJobs} updated={at ? `${at.date}, ${at.time} IST` : null} />;
}

export function Hero() {
  const h1 = useReveal<HTMLHeadingElement>(0.1);
  const lead = useReveal<HTMLParagraphElement>(0.2);
  const ctas = useReveal<HTMLDivElement>(0.3);
  return (
    <section className="ld-hero" aria-labelledby="ld-h1">
      <div className="ld-aur" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <LivePill />
      <h1 id="ld-h1" ref={h1.ref} className={`ld-big ${h1.cls}`} style={h1.style}>
        Every fresher job in India,
        <br />
        <em className="serif g">on one living map.</em>
      </h1>
      <p ref={lead.ref} className={`ld-lead ${lead.cls}`} style={lead.style}>
        BeepJobFetch reads public job boards every morning at 06:00&nbsp;IST, removes duplicates, tags every role and pins it to its city.
      </p>
      <div ref={ctas.ref} className={`ld-ctas ${ctas.cls}`} style={ctas.style}>
        <Link className="btn btn--primary lg" to="/map">
          Open the map <span className="ar">→</span>
        </Link>
        <a className="btn btn--secondary lg" href="#sources">
          See the sources
        </a>
      </div>
      <Stage />
    </section>
  );
}

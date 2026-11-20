import { Link } from 'react-router-dom';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../map/attribution.ts';
import { useReveal } from './parts.tsx';

export function Cta() {
  const r = useReveal<HTMLElement>();
  return (
    <section ref={r.ref} className={`ld-cta ${r.cls}`} style={r.style}>
      <span className="eb">Start exploring</span>
      <h2>
        Today’s fresher jobs,
        <br />
        <em className="serif g">city by city.</em>
      </h2>
      <p>Search in plain words, such as “internships in Bengaluru with stipend”, and apply on the source site.</p>
      <Link className="btn btn--primary lg" to="/map">
        Open the map <span className="ar">→</span>
      </Link>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="ld-ft">
      <div className="ld-fcols">
        <div>
          <Link className="logo" to="/" translate="no">
            <span className="mark" />
            BeepJobFetch
          </Link>
          <p>Fresher jobs and internships across India, on one map.</p>
        </div>
        <nav aria-label="This page">
          <span className="h">This page</span>
          <a href="#pipeline">Pipeline</a>
          <a href="#sources">Sources</a>
          <a href="#tagging">Tagging</a>
          <a href="#numbers">Numbers</a>
        </nav>
        <nav aria-label="In the app">
          <span className="h">In the app</span>
          <Link to="/map">Map</Link>
          <Link to="/insights">Insights</Link>
          <Link to="/review">Review</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </div>
      <div className="ld-word" aria-hidden="true">
        BeepJobFetch
      </div>
      <div className="ld-fb">
        <span>© {new Date().getFullYear()} BeepJobFetch</span>
        <span>Product names and logos are trademarks of their owners.</span>
        <a href={MAP_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
          {MAP_ATTRIBUTION}
        </a>
      </div>
    </footer>
  );
}

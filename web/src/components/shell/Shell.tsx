import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAiStatus } from '../../api/queries.ts';
import './shell.css';

const TITLES: Record<string, string> = {
  '/': 'Fresher jobs and internships across India',
  '/map': 'Map of fresher jobs',
  '/insights': 'Data health and accuracy',
  '/settings': 'AI settings',
  '/review': 'Tagging review',
};

/** Floating glass nav over every page. The home page shows section anchors; app pages show the app links. */
export function Shell() {
  const { pathname } = useLocation();
  const ai = useAiStatus();
  const home = pathname === '/';

  useEffect(() => {
    document.title = `${TITLES[pathname] ?? 'Page not found'} · BeepJobFetch`;
  }, [pathname]);

  const mode = ai.data?.mode;
  const modeText = !mode ? null : mode === 'rules_only' ? 'AI tagging off' : mode === 'full' ? 'Jev + LLM tagging' : mode === 'jev_only' ? 'Jev tagging' : 'LLM tagging';

  return (
    <>
      <nav className="nav glass" aria-label="Main">
        <NavLink to="/" className="logo" aria-label="BeepJobFetch, home" translate="no">
          <span className="mark" />
          <span>BeepJobFetch</span>
        </NavLink>
        {home ? (
          <>
            <a className="l h" href="#pipeline">Pipeline</a>
            <a className="l h" href="#sources">Sources</a>
            <a className="l h" href="#tagging">Tagging</a>
            <a className="l h" href="#numbers">Numbers</a>
          </>
        ) : (
          <>
            <NavLink className="l" to="/map">Map</NavLink>
            <NavLink className="l" to="/insights">Insights</NavLink>
            <NavLink className="l" to="/review">Review</NavLink>
            <NavLink className="l" to="/settings">Settings</NavLink>
          </>
        )}
        {modeText && (
          <NavLink to="/settings" className={`live${mode === 'rules_only' ? ' off' : ''}`} title={ai.data?.modeLabel}>
            <i />
            {modeText}
          </NavLink>
        )}
        {home ? (
          <NavLink className="btn btn--primary" to="/map">
            Open the map <span className="ar">→</span>
          </NavLink>
        ) : (
          <NavLink className="l" to="/">Home</NavLink>
        )}
      </nav>
      <main id="main" className="app-main" tabIndex={-1}>
        <Outlet />
      </main>
    </>
  );
}

/**
 * Dev-only harness: renders JobMap full screen against the live API (through Vite's /api proxy).
 * Query: ?focus=Bengaluru (or Remote), ?inset=400 (fake side panel), ?job=123 (selected job).
 */
import { useCallback, useEffect, useState } from 'react';
import type { CitiesSummaryResponse, JobListItem, JobsPage } from '../../api/types.ts';
import { JobMap } from '../JobMap.tsx';
import type { ScreenOrigin } from '../contract.ts';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../attribution.ts';

const params = () => new URLSearchParams(window.location.search);

function setParam(key: string, value: string | null) {
  const p = params();
  if (value == null) p.delete(key);
  else p.set(key, value);
  const qs = p.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

export function MapHarness() {
  const [summary, setSummary] = useState<CitiesSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusCity, setFocusCity] = useState<string | null>(() => params().get('focus'));
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selected, setSelected] = useState<number | null>(() => Number(params().get('job')) || null);
  const [origin, setOrigin] = useState<ScreenOrigin | null>(null);
  const inset = Number(params().get('inset')) || 0;

  useEffect(() => {
    const qs = params();
    const f = new URLSearchParams();
    for (const k of ['role', 'jobType', 'workMode', 'q']) {
      const v = qs.get(k);
      if (v) f.set(k, v);
    }
    fetch(`/api/cities/summary?${f}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setSummary, (e: Error) => setError(`The API is not running (${e.message}). Start it with npm run api.`));
  }, []);

  useEffect(() => {
    if (!focusCity) {
      setJobs([]);
      return;
    }
    let live = true;
    fetch(`/api/jobs?city=${encodeURIComponent(focusCity)}&pageSize=100`)
      .then((r) => r.json() as Promise<JobsPage>)
      .then((p) => live && setJobs(p.items))
      .catch(() => live && setJobs([]));
    return () => {
      live = false;
    };
  }, [focusCity]);

  const onFocusCity = useCallback((city: string | null) => {
    setFocusCity(city);
    setSelected(null);
    setParam('focus', city);
    setParam('job', null);
  }, []);

  const onSelectJob = useCallback((id: number, o: ScreenOrigin) => {
    setSelected(id);
    setOrigin(o);
    setParam('job', String(id));
  }, []);

  const job = jobs.find((j) => j.id === selected);

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <JobMap
        cities={summary?.cities ?? []}
        remoteCount={summary?.remote.count ?? 0}
        focusCity={focusCity}
        focusJobs={jobs}
        selectedJobId={selected}
        onFocusCity={onFocusCity}
        onSelectJob={onSelectJob}
        insetLeft={inset}
      />
      {inset > 0 && (
        <aside
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: inset,
            background: 'var(--p-bg)',
            borderRight: '1px solid var(--line)',
            boxShadow: 'var(--shadow-1)',
            padding: 24,
            boxSizing: 'border-box',
          }}
        >
          <strong>Side panel stand-in</strong>
          <p style={{ color: 'var(--p-muted)' }}>{inset}px inset</p>
        </aside>
      )}
      {error && (
        <p role="alert" style={{ position: 'absolute', top: 16, left: inset + 16, margin: 0, color: 'var(--err)' }}>
          {error}
        </p>
      )}
      {job && origin && (
        <div
          style={{
            position: 'fixed',
            left: origin.x + 12,
            top: origin.y - 12,
            maxWidth: 280,
            padding: 12,
            background: 'var(--p-bg)',
            border: '1px solid var(--line)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-2)',
            font: '14px/1.4 var(--font-text)',
          }}
        >
          <strong>{job.title}</strong>
          <div style={{ color: 'var(--p-muted)' }}>{job.company}</div>
        </div>
      )}
      <a
        href={MAP_ATTRIBUTION_URL}
        style={{ position: 'absolute', left: inset + 12, bottom: 8, fontSize: 12, color: 'var(--p-muted)' }}
      >
        {MAP_ATTRIBUTION}
      </a>
    </div>
  );
}

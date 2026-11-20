import { lazy, Suspense, useMemo } from 'react';
import type { JobListItem, RoleCount } from '../../api/types.ts';
import { useCitiesSummary } from '../../api/queries.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';
import type { ScreenOrigin } from '../../map/contract.ts';
import { MapBoundary } from '../jobs/MapBoundary.tsx';
import { JobDrawer } from '../jobs/JobDrawer.tsx';
import { RotateCw } from 'lucide-react';
import { CityPanel } from './CityPanel.tsx';
import { groupCounts } from './families.ts';
import { IndiaMap2D } from './IndiaMap2D.tsx';
import type { BaseCity } from './IndiaMap2D.tsx';
import { Attribution, Legend, RemoteButton, ViewSwitch } from './MapOverlays.tsx';
import type { CityStats } from './useCityData.ts';
import { describeError } from '../jobs/states.tsx';
import type { UrlFilters } from '../../state/filters.ts';
import './map2.css';

// The 3D scene (deck.gl) is a separate chunk: 2D users never download it.
const JobMap3D = lazy(() => import('../../map/JobMap.tsx').then((m) => ({ default: m.JobMap })));

interface Props {
  filters: UrlFilters;
  focus: string | null;
  jobId: number | null;
  view3d: boolean;
  onView: (view3d: boolean) => void;
  fam: RoleGroup | null;
  onToggleFam: (g: RoleGroup) => void;
  onFocus: (city: string | null) => void;
  onSelectJob: (id: number, origin: ScreenOrigin) => void;
  onCloseJob: () => void;
  roleCounts: { counts: RoleCount[]; loading: boolean };
  stats: CityStats;
  focusJobs: JobListItem[];
  /** Phone: the job drawer is a full-screen sheet. */
  phone: boolean;
}

const EMPTY_CITIES: never[] = [];
const EMPTY_JOBS: JobListItem[] = [];

/** The map card: the 2D or 3D map with the glass overlays (city panel, remote button, legend, switch) and the job drawer. */
export function MapCard({ filters, focus, jobId, view3d, onView, fam, onToggleFam, onFocus, onSelectJob, onCloseJob, roleCounts, stats, focusJobs, phone }: Props) {
  const summary = useCitiesSummary(filters);
  const base = useCitiesSummary({ cities: [] });

  const counts = useMemo(() => new Map((summary.data?.cities ?? []).map((c) => [c.city, c.count])), [summary.data]);
  const baseCities: BaseCity[] = useMemo(() => (base.data ?? summary.data)?.cities ?? EMPTY_CITIES, [base.data, summary.data]);
  const remoteCount = summary.data?.remote.count ?? 0;
  const families = useMemo(() => groupCounts(roleCounts.counts), [roleCounts.counts]);
  const cityCount = focus === 'Remote' ? remoteCount : focus ? (counts.get(focus) ?? (summary.data ? 0 : null)) : null;
  const failed = summary.isError && !summary.data;

  return (
    <div className={`m2-card${view3d ? ' m2-card--3d' : ''}${focus ? ' m2-card--focus' : ''}`}>
      {view3d ? (
        <div className="m2-3d">
          <MapBoundary>
            <Suspense fallback={<p className="m2-note" role="status">Loading the 3D map…</p>}>
              <JobMap3D
                cities={summary.data?.cities ?? EMPTY_CITIES}
                remoteCount={remoteCount}
                focusCity={focus}
                focusJobs={focus ? focusJobs : EMPTY_JOBS}
                selectedJobId={jobId}
                onFocusCity={onFocus}
                onSelectJob={onSelectJob}
              />
            </Suspense>
          </MapBoundary>
        </div>
      ) : (
        <IndiaMap2D
          cities={baseCities}
          counts={counts}
          focus={focus}
          families={families}
          fam={fam}
          onToggleFam={onToggleFam}
          onSelect={onFocus}
          panelOpen={focus != null}
        />
      )}

      {focus && (
        <CityPanel
          name={focus}
          count={cityCount}
          stats={stats}
          families={families}
          familiesLoading={roleCounts.loading}
          fam={fam}
          onToggleFam={onToggleFam}
          onBack={() => onFocus(null)}
        />
      )}

      {!view3d && <RemoteButton count={remoteCount} active={focus === 'Remote'} onClick={() => onFocus(focus === 'Remote' ? null : 'Remote')} />}
      <Legend view3d={view3d} />
      <ViewSwitch view3d={view3d} onChange={onView} />
      <Attribution />

      {failed && (
        <div className="m2-note m2-note--err glass" role="alert">
          <p>{describeError(summary.error)}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => summary.refetch()}>
            <RotateCw size={16} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      <JobDrawer jobId={jobId} modal={phone} onClose={onCloseJob} />
    </div>
  );
}

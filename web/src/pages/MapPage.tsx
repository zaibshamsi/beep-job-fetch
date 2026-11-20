import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFilterOptions } from '../api/queries.ts';
import type { RoleGroup } from '../design/roleGroups.ts';
import { useMediaQuery } from '../components/jobs/hooks.ts';
import { ExplorePanel } from '../components/jobs/ExplorePanel.tsx';
import { useExploreState, withFocus } from '../components/jobs/useExploreState.ts';
import { familyRoles } from '../components/map2/families.ts';
import { MapCard } from '../components/map2/MapCard.tsx';
import { useCityStats, useFocusJobs, useRoleCounts } from '../components/map2/useCityData.ts';
import { filtersToQuery } from '../state/filters.ts';
import type { ScreenOrigin } from '../map/contract.ts';
import '../components/jobs/jobs.css';

/**
 * The map app (/map): a 400px glass side panel (headline, search, chips, job list) and the map card (2D beacons or the
 * 3D scene, city panel, job drawer). All state is in the URL: q, role, city, jobType, workMode, stipendMin,
 * postedWithinDays, source, isNew, focus, job, sort, page, panel, view. The highlighted role family is local.
 */
export function MapPage() {
  const { sp, filters, focus, jobId, update } = useExploreState();
  const view3d = sp.get('view') === '3d';
  const phone = useMediaQuery('(max-width: 760px)');
  const stacked = useMediaQuery('(max-width: 960px)');

  const [fam, setFam] = useState<RoleGroup | null>(null);
  const toggleFam = useCallback((g: RoleGroup) => setFam((cur) => (cur === g ? null : g)), []);

  const listFilters = useMemo(() => withFocus(filters, focus), [filters, focus]);
  const listKey = filtersToQuery(listFilters).toString();
  // A new city or filter is a new list: the highlighted family no longer applies.
  useEffect(() => setFam(null), [listKey]);

  const roleCounts = useRoleCounts(listFilters, focus != null);
  const stats = useCityStats(listFilters, focus != null);
  const focusJobs = useFocusJobs(listFilters, focus != null && view3d);
  const options = useFilterOptions();
  const famRoles = useMemo(
    () => (fam && !filters.role ? familyRoles(fam, focus ? roleCounts.counts : options.data?.roles) : null),
    [fam, filters.role, focus, roleCounts.counts, options.data?.roles],
  );

  // What opened the drawer, so focus can go back to it when it closes.
  const trigger = useRef<HTMLElement | null>(null);
  const openFromList = useCallback((_id: number, el: HTMLElement) => {
    trigger.current = el;
  }, []);
  const onSelectJob = useCallback(
    (id: number, _at: ScreenOrigin) => {
      trigger.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      update({ params: { job: String(id) } });
    },
    [update],
  );
  const onFocus = useCallback((city: string | null) => update({ params: { focus: city, job: null } }, { replace: true }), [update]);
  const closeJob = useCallback(() => update({ params: { job: null } }), [update]);
  const setView = useCallback((v3: boolean) => update({ params: { view: v3 ? '3d' : null } }, { replace: true }), [update]);

  const prevJob = useRef(jobId);
  useEffect(() => {
    if (prevJob.current != null && jobId == null) {
      const t = trigger.current;
      trigger.current = null;
      if (t?.isConnected) requestAnimationFrame(() => t.focus({ preventScroll: true }));
    }
    prevJob.current = jobId;
  }, [jobId]);

  // Esc steps back: the job drawer, then the highlighted family, then the city.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (jobId != null) {
        e.preventDefault();
        closeJob();
      } else if (!typing && fam) {
        setFam(null);
      } else if (!typing && focus) {
        onFocus(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [jobId, fam, focus, closeJob, onFocus]);

  return (
    <div className="mp">
      <aside className="mp-side" aria-label="Search and job list">
        <ExplorePanel onOpen={openFromList} fam={fam} famRoles={famRoles} onFam={setFam} ownScroll={!stacked} />
      </aside>
      <section className="mp-map" aria-label="Map of jobs">
        <MapCard
          filters={filters}
          focus={focus}
          jobId={jobId}
          view3d={view3d}
          onView={setView}
          fam={fam}
          onToggleFam={toggleFam}
          onFocus={onFocus}
          onSelectJob={onSelectJob}
          onCloseJob={closeJob}
          roleCounts={roleCounts}
          stats={stats}
          focusJobs={focusJobs.data?.items ?? []}
          phone={phone}
        />
      </section>
    </div>
  );
}

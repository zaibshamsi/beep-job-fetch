import { keepPreviousData, useQueries } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { api } from '../../api/client.ts';
import type { JobListItem, RoleCategory } from '../../api/types.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';
import { filtersToQuery, isEmptyFilters } from '../../state/filters.ts';
import { useDelayedFlag, useNow } from './hooks.ts';
import { formatNumber } from './format.ts';
import { JobCard, spotlight } from './JobCard.tsx';
import { mergeLists } from './merge.ts';
import { EmptyState, ErrorState, Spinner } from './states.tsx';
import { useExploreState, withFocus } from './useExploreState.ts';

export const PAGE_SIZE = 25;

interface Props {
  onOpen: (id: number, el: HTMLElement) => void;
  /** The panel's scroll area (desktop). null where the page itself scrolls (phones). */
  scrollRef: RefObject<HTMLDivElement | null> | null;
  /** Role family highlighted on the map, and the API roles it covers (one query each, merged). */
  fam: RoleGroup | null;
  famRoles: RoleCategory[] | null;
}

/** GET /jobs with the current filters plus the focused city, 25 a page, "Load more" appends. */
export function JobList({ onOpen, scrollRef, fam, famRoles }: Props) {
  const { sp, filters, focus, jobId, sort, pages, update } = useExploreState();
  const listFilters = useMemo(() => withFocus(filters, focus), [filters, focus]);
  const now = useNow();
  const sortId = useId();
  const section = useRef<HTMLDivElement>(null);

  // One query per role when a family is highlighted, otherwise a single query; pages 1..n of each.
  const roleSets: (RoleCategory | undefined)[] = useMemo(() => (famRoles && famRoles.length > 0 ? famRoles : [undefined]), [famRoles]);
  const baseKey = filtersToQuery(listFilters).toString();
  const results = useQueries({
    queries: roleSets.flatMap((role) => {
      const f = role ? { ...listFilters, role } : listFilters;
      const key = filtersToQuery(f).toString();
      return Array.from({ length: pages }, (_, i) => ({
        queryKey: ['jobs', key, i + 1, PAGE_SIZE, sort],
        queryFn: () => api.jobs(f, i + 1, PAGE_SIZE, sort),
        placeholderData: i === 0 ? keepPreviousData : undefined,
      }));
    }),
  });

  const firsts = roleSets.map((_, r) => results[r * pages]!);
  const total = firsts.reduce((s, r) => s + (r.data?.total ?? 0), 0);
  const haveData = firsts.every((r) => r.data);
  const stamp = results.map((r) => r.dataUpdatedAt).join(',');
  const items = useMemo(
    () =>
      mergeLists(
        roleSets.map((_, r) => results.slice(r * pages, (r + 1) * pages).flatMap((q) => q.data?.items ?? [])),
        sort,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stamp, sort, roleSets, pages],
  );

  const firstPending = firsts.some((r) => r.isPending);
  const firstError = firsts.find((r) => r.isError && !r.data);
  const later = results.filter((_, i) => i % pages !== 0);
  const pendingMore = later.find((r) => r.isPending);
  const moreError = later.find((r) => r.isError);
  const fetching = firsts.some((r) => r.isFetching);
  const skeleton = useDelayedFlag(firstPending, 120);
  const refreshing = useDelayedFlag(fetching && firsts.some((r) => r.isPlaceholderData));

  // A new filter, city or sort starts the list at its top. If the reader is up in the filters, nothing moves.
  useEffect(() => {
    const box = scrollRef?.current;
    const list = section.current;
    if (!box || !list) return;
    const listTop = list.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (box.scrollTop > listTop) box.scrollTo({ top: listTop });
  }, [baseKey, sort, fam, scrollRef]);

  const loadMore = () => update({ params: { page: String(pages + 1) } }, { replace: true });
  const clearAll = () => update({ filters: { cities: [] }, params: { focus: null } });
  const search = sp.toString();

  const where = focus === 'Remote' ? null : focus ? `in ${focus}` : filters.cities.length > 0 ? `in ${filters.cities.join(', ')}` : 'across India';
  const countLine = haveData ? (
    <>
      <b>{formatNumber(total)}</b> {fam ? `${fam} ` : ''}
      {focus === 'Remote' ? 'remote ' : ''}
      {total === 1 ? 'role' : 'roles'}
      {where ? ` ${where}` : ''}
    </>
  ) : (
    <span className="mp-skel" style={{ width: 150, height: 14 }} />
  );

  const onSort = (e: ChangeEvent<HTMLSelectElement>) => update({ params: { sort: e.target.value === 'relevance' ? 'match' : null } }, { replace: true });

  return (
    <div ref={section} className="mp-results">
      <div className="mp-lh">
        <p className="mp-lh__count" aria-live="polite">
          {countLine}
          {refreshing && <Spinner label="Updating the list" />}
        </p>
        <label htmlFor={sortId} className="visually-hidden">
          Sort jobs
        </label>
        <select id={sortId} className="mp-sort" value={sort} onChange={onSort}>
          <option value="newest">Newest</option>
          <option value="relevance" disabled={!filters.q}>
            Best match
          </option>
        </select>
      </div>

      <div className="mp-list" aria-busy={fetching || undefined} onPointerMove={spotlight}>
        {skeleton ? (
          <SkeletonCards />
        ) : firstError && !haveData ? (
          <ErrorState error={firstError.error} onRetry={() => firsts.forEach((r) => r.isError && r.refetch())} />
        ) : haveData && items.length === 0 ? (
          <EmptyState title="No roles match">
            <span>
              {filters.q && filters.q.trim().includes(' ')
                ? `Press Enter in the search box to turn “${filters.q}” into filters instead of keywords.`
                : 'Remove a filter to widen the search.'}
            </span>
            {(!isEmptyFilters(filters) || focus || fam) && (
              <button type="button" className="btn btn--secondary btn--sm" onClick={clearAll}>
                Clear filters
              </button>
            )}
          </EmptyState>
        ) : haveData ? (
          <>
            {items.map((job: JobListItem, i) => (
              <JobCard key={job.id} job={job} index={i} selected={job.id === jobId} search={search} now={now} onOpen={onOpen} />
            ))}
            {moreError ? (
              <ErrorState error={moreError.error} onRetry={() => moreError.refetch()} compact />
            ) : items.length < total ? (
              <button type="button" className="mp-more" onClick={loadMore} disabled={!!pendingMore}>
                {pendingMore && <Spinner />}
                Show {formatNumber(Math.min(PAGE_SIZE, total - items.length))} more
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonCards() {
  return (
    <>
      <p className="visually-hidden" role="status">
        Loading jobs
      </p>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="mp-job mp-job--skel" aria-hidden="true">
          <span className="mg mp-skel" />
          <span className="mp-job__body">
            <span className="mp-skel" style={{ width: `${70 - (i % 3) * 8}%`, height: 16 }} />
            <span className="mp-skel" style={{ width: '38%', marginTop: 8 }} />
            <span className="mp-skel" style={{ width: '82%', marginTop: 10 }} />
            <span className="mp-skel" style={{ width: '48%', marginTop: 12, height: 11 }} />
          </span>
        </div>
      ))}
    </>
  );
}

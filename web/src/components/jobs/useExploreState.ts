import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UrlFilters } from '../../state/filters.ts';
import { filtersToQuery, readFilters } from '../../state/filters.ts';

/** Every URL key a filter can write, derived from the shared serializer so it never drifts. */
const FILTER_KEYS = [
  ...new Set(
    filtersToQuery({
      q: 'x',
      role: 'Other',
      cities: ['x'],
      jobType: 'internship',
      workMode: 'remote',
      stipendMin: 1,
      postedWithinDays: 1,
      source: 'x',
      isNew: true,
    }).keys(),
  ),
];

export type SortParam = 'newest' | 'relevance';
const MAX_PAGES = 40;

export interface ExplorePatch {
  /** New filters (or an updater). Resets the list to its first page. */
  filters?: UrlFilters | ((prev: UrlFilters) => UrlFilters);
  /** Other params: null deletes. */
  params?: Record<string, string | null>;
}

/** List filters: the URL filters narrowed to the focused city (or to remote work for 'Remote'). */
export function withFocus(f: UrlFilters, focus: string | null): UrlFilters {
  if (!focus) return f;
  if (focus === 'Remote') return { ...f, cities: [], workMode: 'remote' };
  return { ...f, cities: [focus] };
}

/**
 * The map page's URL state in one place: filters (shared shape from state/filters.ts), ?focus=, ?job=,
 * ?sort=match, ?page= (how many pages of 25 the list shows) and ?panel=filters.
 * `update` writes filters and other params in ONE navigation, so they never overwrite each other.
 */
export function useExploreState() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readFilters(sp), [sp]);
  const focus = sp.get('focus') || null;
  const rawJob = sp.get('job');
  const jobId = rawJob && /^\d+$/.test(rawJob) ? Number(rawJob) : null;
  const sort: SortParam = sp.get('sort') === 'match' && filters.q ? 'relevance' : 'newest';
  const rawPage = Number(sp.get('page'));
  const pages = Number.isInteger(rawPage) && rawPage > 1 ? Math.min(rawPage, MAX_PAGES) : 1;
  const filtersOpen = sp.get('panel') === 'filters';

  const update = useCallback(
    (patch: ExplorePatch, opts: { replace?: boolean } = {}) => {
      setSp(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (patch.filters) {
            const next = typeof patch.filters === 'function' ? patch.filters(readFilters(prev)) : patch.filters;
            for (const k of FILTER_KEYS) out.delete(k);
            for (const [k, v] of filtersToQuery(next).entries()) out.append(k, v);
            out.delete('page');
            if (!next.q) out.delete('sort');
          }
          const params = patch.params ?? {};
          // A new city or sort is a new list: back to its first page.
          if ('focus' in params || 'sort' in params) out.delete('page');
          for (const [k, v] of Object.entries(params)) {
            if (v == null) out.delete(k);
            else out.set(k, v);
          }
          return out;
        },
        { replace: opts.replace },
      );
    },
    [setSp],
  );

  return { sp, filters, focus, jobId, sort, pages, filtersOpen, update };
}

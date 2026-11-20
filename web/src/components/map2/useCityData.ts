import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type { JobType, RoleCount } from '../../api/types.ts';
import { filtersToQuery } from '../../state/filters.ts';
import type { UrlFilters } from '../../state/filters.ts';
import { ALL_ROLES } from './families.ts';

const STALE = 60_000;
export const FOCUS_PAGE_SIZE = 100;

const keyOf = (f: UrlFilters) => filtersToQuery(f).toString();

/**
 * Jobs per role for the focused city (or Remote) under the current filters: one small count query per role
 * (GET /jobs, pageSize 1, only `total` is used), because /cities/summary lists only the top 5 roles.
 */
export function useRoleCounts(listFilters: UrlFilters, enabled: boolean): { counts: RoleCount[]; loading: boolean } {
  const roles = listFilters.role ? [listFilters.role] : ALL_ROLES;
  const results = useQueries({
    queries: roles.map((role) => {
      const f = { ...listFilters, role };
      return {
        queryKey: ['jobs', keyOf(f), 1, 1, 'newest'],
        queryFn: () => api.jobs(f, 1, 1, 'newest'),
        enabled,
        staleTime: STALE,
        select: (p: { total: number }) => p.total,
      };
    }),
  });
  const counts: RoleCount[] = [];
  results.forEach((r, i) => {
    if (r.data != null && r.data > 0) counts.push({ role: roles[i]!, count: r.data });
  });
  return { counts, loading: enabled && results.some((r) => r.isPending) };
}

export interface CityStats {
  internships: number | null;
  fullTime: number | null;
  /** Average of the stated minimum monthly pay across the newest 100 paid jobs, in INR; null when none state pay. */
  avgPay: number | null;
  loading: boolean;
}

/** Average monthly pay of the paid jobs in a list. */
export function averagePay(items: { stipendMinMonthlyInr: number | null }[]): number | null {
  const paid = items.map((j) => j.stipendMinMonthlyInr ?? 0).filter((n) => n > 0);
  return paid.length ? Math.round(paid.reduce((s, n) => s + n, 0) / paid.length) : null;
}

/** "₹25k" for the Avg. pay tile. */
export const payShort = (inr: number | null): string => (inr ? `₹${Math.round(inr / 1000)}k` : '—');

/** The three stat tiles of the city panel, from real queries (two counts and the newest 100 jobs). */
export function useCityStats(listFilters: UrlFilters, enabled: boolean): CityStats {
  const typeCount = (t: JobType) => {
    const blocked = listFilters.jobType != null && listFilters.jobType !== t;
    const f = { ...listFilters, jobType: t };
    return {
      queryKey: ['jobs', keyOf(f), 1, 1, 'newest'],
      queryFn: () => api.jobs(f, 1, 1, 'newest'),
      enabled: enabled && !blocked,
      staleTime: STALE,
      select: (p: { total: number }) => (blocked ? 0 : p.total),
    };
  };
  const [intern, full] = useQueries({ queries: [typeCount('internship'), typeCount('full_time')] });
  const list = useFocusJobs(listFilters, enabled);
  const blockedIntern = listFilters.jobType != null && listFilters.jobType !== 'internship';
  const blockedFull = listFilters.jobType != null && listFilters.jobType !== 'full_time';
  return {
    internships: blockedIntern ? 0 : (intern?.data ?? null),
    fullTime: blockedFull ? 0 : (full?.data ?? null),
    avgPay: list.data ? averagePay(list.data.items) : null,
    loading: enabled && (list.isPending || (!blockedIntern && intern?.isPending === true) || (!blockedFull && full?.isPending === true)),
  };
}

/** The newest 100 jobs of the focus (shared by the stat tiles and the 3D map's pins). */
export function useFocusJobs(listFilters: UrlFilters, enabled: boolean) {
  return useQuery({
    queryKey: ['jobs', keyOf(listFilters), 1, FOCUS_PAGE_SIZE, 'newest'],
    queryFn: () => api.jobs(listFilters, 1, FOCUS_PAGE_SIZE, 'newest'),
    enabled,
    staleTime: STALE,
  });
}

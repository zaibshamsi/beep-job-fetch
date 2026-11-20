import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { useCitiesSummary, useJob, useStats } from '../../api/queries.ts';
import type { UrlFilters } from '../../state/filters.ts';
import { pickDemoJob } from './format.ts';

const NO_FILTERS: UrlFilters = { cities: [] };
const STIPEND_INTERNSHIPS: UrlFilters = { cities: [], jobType: 'internship', stipendMin: 1 };

export const useLandingStats = () => useStats();
export const useLandingCities = () => useCitiesSummary(NO_FILTERS);

/**
 * GET /jobs?jobType=internship&stipendMin=1&pageSize=5 (newest first). Its `total` feeds the chips card, its first
 * item feeds the floating job card, and the first item with a city feeds the tagging demo.
 */
export const useStipendInternships = () =>
  useQuery({ queryKey: ['landing', 'stipendInternships'], queryFn: () => api.jobs(STIPEND_INTERNSHIPS, 1, 5, 'newest') });

/** Full detail of the demo post (it has `taggedBy`, raw location and compensation text). */
export function useDemoJob() {
  const list = useStipendInternships();
  const pick = list.data ? pickDemoJob(list.data.items) : undefined;
  const detail = useJob(pick?.id ?? null);
  return {
    job: detail.data,
    // loading while the list or the detail loads; "empty" when the list loaded without a suitable post
    loading: list.isPending || (pick != null && detail.isPending),
    error: list.isError || detail.isError,
    empty: list.isSuccess && !pick,
    refetch: () => {
      void list.refetch();
      void detail.refetch();
    },
  };
}

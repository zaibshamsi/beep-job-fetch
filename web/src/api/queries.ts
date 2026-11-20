import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from './client.ts';
import type { UrlFilters } from '../state/filters.ts';
import { filtersToQuery } from '../state/filters.ts';

const key = (f: UrlFilters) => filtersToQuery(f).toString();

export const useJobs = (f: UrlFilters, page = 1, pageSize = 25, sort: 'newest' | 'relevance' = 'newest') =>
  useQuery({
    queryKey: ['jobs', key(f), page, pageSize, sort],
    queryFn: () => api.jobs(f, page, pageSize, sort),
    placeholderData: keepPreviousData,
  });

export const useJob = (id: number | null) =>
  useQuery({ queryKey: ['job', id], queryFn: () => api.job(id!), enabled: id != null });

export const useCitiesSummary = (f: UrlFilters) =>
  useQuery({ queryKey: ['cities', key(f)], queryFn: () => api.citiesSummary(f), placeholderData: keepPreviousData });

export const useFilterOptions = () =>
  useQuery({ queryKey: ['filterOptions'], queryFn: api.filterOptions, staleTime: 5 * 60_000 });

export const useStats = (refetchMs?: number) =>
  useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: refetchMs });

export const useAiStatus = () => useQuery({ queryKey: ['aiStatus'], queryFn: api.aiStatus });

import type {
  AiStatus,
  ApiErrorBody,
  CitiesSummaryResponse,
  FilterOptions,
  JobDetail,
  JobsPage,
  ParsedSearch,
  PipelineRun,
  Provider,
  ProviderInput,
  Stats,
  TestResult,
} from './types.ts';
import type { UrlFilters } from '../state/filters.ts';
import { filtersToQuery } from '../state/filters.ts';

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public body?: ApiErrorBody,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, body?.error.code ?? 'HTTP_' + res.status, body?.error.message ?? res.statusText, body);
  }
  return (await res.json()) as T;
}

export const api = {
  jobs: (f: UrlFilters, page = 1, pageSize = 25, sort: 'newest' | 'relevance' = 'newest') => {
    const qs = filtersToQuery(f);
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    qs.set('sort', sort);
    return request<JobsPage>(`/jobs?${qs}`);
  },
  job: (id: number) => request<JobDetail>(`/jobs/${id}`),
  citiesSummary: (f: UrlFilters) => request<CitiesSummaryResponse>(`/cities/summary?${filtersToQuery(f)}`),
  filterOptions: () => request<FilterOptions>('/filters/options'),
  parseSearch: (query: string) =>
    request<ParsedSearch>('/search/parse', { method: 'POST', body: JSON.stringify({ query }) }),
  stats: () => request<Stats>('/stats'),
  runs: (limit = 20) => request<{ items: PipelineRun[] }>(`/pipeline/runs?limit=${limit}`),
  run: (id: number) => request<PipelineRun>(`/pipeline/runs/${id}`),
  startRun: () => request<{ runId: number }>('/pipeline/run', { method: 'POST' }),
  aiStatus: () => request<AiStatus>('/settings/ai'),
  saveProvider: (p: Provider, input: ProviderInput) =>
    request<AiStatus | { ok: true }>(`/settings/ai/${p}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeProvider: (p: Provider) => request<AiStatus | { ok: true }>(`/settings/ai/${p}`, { method: 'DELETE' }),
  testProvider: (p: Provider, overrides: ProviderInput = {}) =>
    request<TestResult>(`/settings/ai/${p}/test`, { method: 'POST', body: JSON.stringify(overrides) }),
  health: () => request<{ ok: boolean; db: boolean }>('/health'),
};

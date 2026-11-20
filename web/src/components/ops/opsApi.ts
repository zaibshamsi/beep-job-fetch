/**
 * Admin calls for the ops pages. Same shapes as src/api/client.ts, plus:
 * - the x-admin-token header (docs/API.md "Auth"), read from this browser's storage when the person pasted one;
 * - the accuracy endpoints (/accuracy/sample, /accuracy/labels, /accuracy/summary), which client.ts does not have yet.
 */
import { ApiError } from '../../api/client.ts';
import type {
  AiStatus,
  ApiErrorBody,
  JobType,
  PipelineRun,
  Provider,
  ProviderInput,
  RoleCategory,
  Stats,
  TestResult,
  WorkMode,
} from '../../api/types.ts';

const BASE = '/api';
const TOKEN_KEY = 'beep.adminToken';

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setAdminToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the token lasts for this call only */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { 'x-admin-token': token } : {}),
        ...init.headers,
      },
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK', e instanceof Error ? e.message : 'Network error');
  }
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error, usually the dev proxy when the API is down */
    }
    throw new ApiError(res.status, body?.error?.code ?? 'HTTP_' + res.status, body?.error?.message ?? res.statusText, body);
  }
  return (await res.json()) as T;
}

export type AccuracyField = 'role_category' | 'cities' | 'job_type' | 'is_fresher';
export const ACCURACY_FIELDS: AccuracyField[] = ['role_category', 'cities', 'job_type', 'is_fresher'];

export interface SavedLabel {
  correct: boolean;
  correctValue: string | null;
}

export interface SampleItem {
  id: number;
  title: string;
  company: string;
  locationRaw: string | null;
  descriptionExcerpt: string;
  applyUrl: string | null;
  primarySource: string;
  predicted: {
    role_category: RoleCategory | null;
    cities: string[];
    job_type: JobType | null;
    is_fresher: boolean | null;
  };
  workMode: WorkMode | null;
  labels: Partial<Record<AccuracyField, SavedLabel>>;
}

export interface AccuracySample {
  size: number;
  fields: AccuracyField[];
  items: SampleItem[];
}

export interface LabelInput {
  jobId: number;
  field: AccuracyField;
  predicted: string | null;
  correct: boolean;
  correctValue?: string | null;
}

export type AccuracySummary = Stats['accuracy'];

/** Stats plus counters the worker writes that types.ts does not list yet. */
export type RunStatsExtra = {
  stageMs?: Record<string, number>;
  enrichFailures?: number;
  cacheHits?: number;
  retagged?: number;
};

export const opsApi = {
  aiStatus: () => request<AiStatus>('/settings/ai'),
  saveProvider: (p: Provider, input: ProviderInput) =>
    request<AiStatus>(`/settings/ai/${p}`, { method: 'PUT', body: JSON.stringify(input) }),
  removeProvider: (p: Provider) => request<AiStatus>(`/settings/ai/${p}`, { method: 'DELETE' }),
  testProvider: (p: Provider, overrides: ProviderInput) =>
    request<TestResult>(`/settings/ai/${p}/test`, { method: 'POST', body: JSON.stringify(overrides) }),
  startRun: () => request<{ runId: number }>('/pipeline/run', { method: 'POST' }),
  run: (id: number) => request<PipelineRun>(`/pipeline/runs/${id}`),
  sample: (size = 50) => request<AccuracySample>(`/accuracy/sample?size=${size}`),
  saveLabels: (labels: LabelInput[]) =>
    request<{ upserted: number }>('/accuracy/labels', { method: 'PUT', body: JSON.stringify({ labels }) }),
  accuracySummary: () => request<AccuracySummary>('/accuracy/summary'),
};

export interface Explained {
  title: string;
  fix: string;
  needsToken: boolean;
}

/** Turn any error from the API into what happened and how to fix it. */
export function explainError(err: unknown): Explained {
  if (err instanceof ApiError) {
    if (err.status === 401)
      return {
        title: 'The API asks for an admin token.',
        fix: 'ADMIN_TOKEN is set in .env. Paste the same value below; it stays in this browser only.',
        needsToken: true,
      };
    if (err.status === 403)
      return {
        title: 'The admin token you pasted does not match.',
        fix: 'Copy ADMIN_TOKEN from .env again and paste it below.',
        needsToken: true,
      };
    if (err.status === 503 || err.code === 'DB_UNAVAILABLE')
      return {
        title: 'SQL Server is not answering.',
        fix: 'Start SQL Server (see the README, "Setup"), then reload this page.',
        needsToken: false,
      };
    if (err.status === 0 || err.code.startsWith('HTTP_5') || err.status === 502 || err.status === 504)
      return {
        title: 'The API is not running.',
        fix: 'Start it with npm run api from the project folder, then try again.',
        needsToken: false,
      };
    if (err.status === 404) return { title: 'Not found.', fix: err.message, needsToken: false };
    return { title: err.message || `The API answered ${err.status}.`, fix: '', needsToken: false };
  }
  return { title: err instanceof Error ? err.message : 'Something went wrong.', fix: 'Reload the page and try again.', needsToken: false };
}

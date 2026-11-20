/** Response shapes of the REST API. Source of truth: docs/API.md. Keep in sync. */

export const ROLE_CATEGORIES = [
  'Software Engineering',
  'Data / AI / ML',
  'QA / Testing',
  'DevOps / Cloud',
  'Cybersecurity',
  'UI / UX Design',
  'Product Management',
  'Business / Data Analyst',
  'Sales / Business Development',
  'Marketing',
  'Content / Writing',
  'Finance / Accounting',
  'HR / Recruiting',
  'Operations / Supply Chain',
  'Customer Support',
  'Core Engineering',
  'Consulting',
  'Other',
] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];
export type JobType = 'internship' | 'full_time' | 'apprenticeship' | 'contract';
export type WorkMode = 'onsite' | 'hybrid' | 'remote';

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  internship: 'Internship',
  full_time: 'Full time',
  apprenticeship: 'Apprenticeship',
  contract: 'Contract',
};
export const WORK_MODE_LABEL: Record<WorkMode, string> = { onsite: 'On site', hybrid: 'Hybrid', remote: 'Remote' };

export interface JobSourceLink {
  source: string;
  applyUrl: string;
}

export interface JobListItem {
  id: number;
  title: string;
  company: string;
  cities: string[];
  locationRaw: string | null;
  roleCategory: RoleCategory | null;
  jobType: JobType | null;
  workMode: WorkMode | null;
  stipendMinMonthlyInr: number | null;
  stipendMaxMonthlyInr: number | null;
  skills: string[];
  postedAt: string | null;
  firstSeenAt: string;
  isNew: boolean;
  sources: JobSourceLink[];
  snippet: string;
}

export interface JobDetail extends JobListItem {
  description: string;
  status: 'active' | 'expired';
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  needsReview: boolean;
  confidence: number | null;
  taggedBy: Record<string, 'rules' | 'jev' | 'llm' | 'source'> | null;
  promptVersion: string | null;
  employmentTypeRaw: string | null;
  compensationRaw: string | null;
}

export interface JobsPage {
  items: JobListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RoleCount {
  role: RoleCategory;
  count: number;
}

export interface CitySummary {
  city: string;
  state: string;
  lat: number;
  lng: number;
  count: number;
  topRoles: RoleCount[];
}

export interface CitiesSummaryResponse {
  cities: CitySummary[];
  remote: { count: number; topRoles: RoleCount[] };
  unlocated: { count: number };
}

export interface FilterOptions {
  roles: RoleCount[];
  cities: { city: string; state: string; count: number }[];
  jobTypes: { value: JobType; count: number }[];
  workModes: { value: WorkMode; count: number }[];
  sources: { source: string; count: number }[];
  postedRanges: { label: string; days: number; count: number }[];
}

/** Filters as the NL parser returns them (packages/shared JobFilters). */
export interface ParsedFilters {
  q?: string;
  keywords?: string[];
  roleCategory?: RoleCategory | null;
  cities?: string[];
  jobType?: JobType | null;
  workMode?: WorkMode | null;
  stipendMin?: number | null;
  postedWithinDays?: number | null;
  source?: string | null;
  isNew?: boolean;
}

export interface SearchChip {
  field: string;
  label: string;
  value: unknown;
}

export interface ParsedSearch {
  filters: ParsedFilters;
  chips: SearchChip[];
  parsedBy: 'rules' | 'jev' | 'llm' | 'cache';
  focusCity: string | null;
}

export type RunStatus = 'queued' | 'running' | 'success' | 'partial' | 'failed';

export interface RunStatsPerSource {
  fetched: number;
  normalized: number;
  rejected: number;
  ms: number;
  error?: string;
  skipped?: string;
}

export interface PipelineRun {
  id: number;
  triggerType: 'cron' | 'manual' | 'startup';
  status: RunStatus;
  stage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  stats: Partial<{
    fetched: number;
    rejected: number;
    notFresher: number;
    duplicatesExact: number;
    duplicatesFuzzy: number;
    newJobs: number;
    updatedJobs: number;
    expiredJobs: number;
    taggedByRules: number;
    taggedByJev: number;
    taggedByLlm: number;
    needsReview: number;
    perSource: Record<string, RunStatsPerSource>;
  }> | null;
  error: string | null;
}

export interface SourceStatus {
  name: string;
  description: string | null;
  homepage: string | null;
  accessMethod: string | null;
  termsUrl: string | null;
  termsStatus: 'allowed' | 'allowed_with_limits' | 'forbidden' | 'unclear' | 'unchecked';
  termsNotes: string | null;
  robotsCheckedAt: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  activeJobs: number;
  lastRun: RunStatsPerSource | null;
}

export interface LlmUsageRow {
  provider: string;
  model: string;
  purpose: string;
  calls: number;
  failures: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  avgLatencyMs: number | null;
}

export interface Stats {
  lastRun: PipelineRun | null;
  activeRun: PipelineRun | null;
  recentRuns: PipelineRun[];
  totals: {
    activeJobs: number;
    newToday: number;
    needsReview: number;
    byRole: RoleCount[];
    byCity: { city: string; count: number }[];
    bySource: { source: string; count: number }[];
  };
  sources: SourceStatus[];
  llmUsage: {
    totals: { calls: number; inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number };
    byModel: LlmUsageRow[];
  };
  costPer1000: {
    tagging: {
      costUsd: number;
      jevCostUsd: number;
      llmCostUsd: number;
      postsTagged: number;
      per1000Posts: number;
      escalationRate: number;
      runs: number;
    } | null;
    search: { costUsd: number; searches: number; per1000Searches: number } | null;
  };
  accuracy: {
    labelledJobs: number;
    fields: Record<string, { correct: number; total: number; percent: number | null }>;
    overall: { correct: number; total: number; percent: number | null };
  };
}

export type Provider = 'jev' | 'llm';

export interface ProviderStatus {
  provider: Provider;
  configured: boolean;
  source: 'db' | 'env' | 'none';
  maskedKey: string | null;
  model: string | null;
  endpoint?: string | null;
  deployment?: string | null;
  apiVersion?: string | null;
}

export interface AiStatus {
  jev: ProviderStatus;
  llm: ProviderStatus;
  mode: 'full' | 'jev_only' | 'llm_only' | 'rules_only';
  modeLabel: string;
}

export interface ProviderInput {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  deployment?: string;
  apiVersion?: string;
}

export interface TestResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  error?: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
  runId?: number;
}

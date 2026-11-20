/**
 * Public contracts of @beep/ai. Other workspaces (worker, api) import ONLY from '@beep/ai'.
 * Implementations live in rules/, providers/, settings/, enrich/, search/. Keep these signatures stable.
 */
import type { Enrichment, FieldProvenance, JobFilters, JobPost, JobType, RoleCategory, WorkMode } from '@beep/shared';

// ---------- rules (no network, no cost) ----------
export type FresherVerdict = 'yes' | 'no' | 'unknown';

export interface RuleTagResult {
  cities: string[]; // canonical gazetteer names; [] if none found
  workModeHint: WorkMode | null;
  jobTypeHint: JobType | null;
  roleHint: RoleCategory | null;
  roleConfidence: number; // 0..1, how sure the keyword rules are about roleHint
  fresher: FresherVerdict;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  stipendMinMonthlyInr: number | null;
  stipendMaxMonthlyInr: number | null;
  skills: string[]; // max 8
}

// ---------- enrichment graph ----------
export interface EnrichOptions {
  runId?: number;
  jobId?: number;
}

export interface EnrichResult {
  enrichment: Enrichment;
  provenance: FieldProvenance; // which of rules | jev | llm | source decided each field
  needsReview: boolean;
  promptVersion: string;
  /** Which providers were actually called for this post. */
  used: { jev: boolean; llm: boolean };
}

// ---------- settings (provider keys; encrypted at rest in app_settings) ----------
export type Provider = 'jev' | 'llm';

export interface ProviderStatus {
  provider: Provider;
  configured: boolean;
  source: 'db' | 'env' | 'none'; // where the effective key comes from; db wins over env
  maskedKey: string | null; // e.g. "sk-...a3f9", never the full key
  model: string | null;
  endpoint?: string | null; // llm only (Azure Foundry)
  deployment?: string | null; // llm only
  apiVersion?: string | null; // llm only
}

export type AiModeName = 'full' | 'jev_only' | 'llm_only' | 'rules_only';
export interface AiStatus {
  jev: ProviderStatus;
  llm: ProviderStatus;
  mode: AiModeName;
  modeLabel: string; // e.g. "Jev + LLM: full tagging"
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
  error?: string; // exact provider error text
}

// ---------- natural-language search ----------
export interface SearchChip {
  field: keyof JobFilters | 'keyword';
  label: string; // shown on the chip, e.g. "Pune"
  value: unknown;
}

export interface ParsedSearch {
  filters: JobFilters;
  chips: SearchChip[];
  parsedBy: 'rules' | 'jev' | 'llm' | 'cache';
  focusCity: string | null; // map flies here when set
}

export type { JobPost };

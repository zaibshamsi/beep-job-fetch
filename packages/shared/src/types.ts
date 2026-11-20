import { z } from 'zod';
import { JOB_TYPES, ROLE_CATEGORIES, WORK_MODES } from './roles.ts';

/** A post exactly as fetched, before normalising. */
export interface RawPost {
  source: string;
  sourceJobId: string;
  payload: unknown; // original JSON-like object; stored verbatim in raw_posts
}

/** Standard format every source adapter must produce. */
export const JobPostSchema = z.object({
  source: z.string().min(1),
  sourceJobId: z.string().min(1),
  title: z.string().min(2).max(300),
  company: z.string().min(1).max(300),
  locationRaw: z.string().max(500).default(''),
  description: z.string().default(''),
  applyUrl: z.string().url().max(1000),
  postedAt: z.coerce.date().nullable().default(null),
  employmentTypeRaw: z.string().max(200).nullable().default(null),
  compensationRaw: z.string().max(500).nullable().default(null),
  /** Set when the source itself is fresher-specific (an internship board). Rules still run. */
  sourceHint: z.enum(['internship', 'fresher', 'none']).default('none'),
});
export type JobPost = z.infer<typeof JobPostSchema>;

/** Fields produced by enrichment (rules + Jev + LLM). */
export const EnrichmentSchema = z.object({
  roleCategory: z.enum(ROLE_CATEGORIES),
  cities: z.array(z.string()).max(12), // canonical gazetteer names, or ['Remote']
  workMode: z.enum(WORK_MODES),
  jobType: z.enum(JOB_TYPES),
  isFresher: z.boolean(),
  experienceMinYears: z.number().nullable(),
  experienceMaxYears: z.number().nullable(),
  stipendMinMonthlyInr: z.number().nullable(),
  stipendMaxMonthlyInr: z.number().nullable(),
  skills: z.array(z.string()).max(8),
  confidence: z.number().min(0).max(1),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

export type TaggedBy = 'rules' | 'jev' | 'llm' | 'source';
export type FieldProvenance = Partial<Record<keyof Enrichment, TaggedBy>>;

/** Per-run counters. Every pipeline stage increments these; stored as JSON in pipeline_runs.stats. */
export interface RunStats {
  perSource: Record<
    string,
    { fetched: number; normalized: number; rejected: number; error?: string; skipped?: string; ms: number }
  >;
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
}
export const emptyStats = (): RunStats => ({
  perSource: {},
  fetched: 0,
  rejected: 0,
  notFresher: 0,
  duplicatesExact: 0,
  duplicatesFuzzy: 0,
  newJobs: 0,
  updatedJobs: 0,
  expiredJobs: 0,
  taggedByRules: 0,
  taggedByJev: 0,
  taggedByLlm: 0,
  needsReview: 0,
});

/** Filters shared by GET /jobs, GET /cities/summary and the natural-language parser. */
export const JobFiltersSchema = z.object({
  q: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  roleCategory: z.enum(ROLE_CATEGORIES).nullable().optional(),
  cities: z.array(z.string()).optional(),
  jobType: z.enum(JOB_TYPES).nullable().optional(),
  workMode: z.enum(WORK_MODES).nullable().optional(),
  stipendMin: z.number().nullable().optional(), // INR per month; 1 means "any stipend / paid"
  postedWithinDays: z.number().nullable().optional(),
  source: z.string().nullable().optional(),
  isNew: z.boolean().optional(), // first seen in last 24h
});
export type JobFilters = z.infer<typeof JobFiltersSchema>;

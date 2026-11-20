import { query, REMOTE, type Enrichment, type FieldProvenance } from '@beep/shared';
import type { CachedEnrichment } from './enrich.ts';
import { isCurrentVersion } from './retag.ts';
import { chunk, inList } from './util.ts';

type JobRow = {
  id: number;
  content_hash: string;
  role_category: Enrichment['roleCategory'];
  job_type: Enrichment['jobType'];
  work_mode: Enrichment['workMode'];
  is_fresher: boolean;
  exp_min_years: number | null;
  exp_max_years: number | null;
  stipend_min_monthly_inr: number | null;
  stipend_max_monthly_inr: number | null;
  skills: string | null;
  confidence: number | null;
  tagged_by: string | null;
  prompt_version: string;
};

const parseJson = <T>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Finds saved enrichments for identical content. Rows flagged needs_review are skipped on purpose,
 * so a low-quality tagging gets another chance once better providers are configured.
 */
export async function loadTagCache(contentHashes: string[]): Promise<Map<string, CachedEnrichment>> {
  const out = new Map<string, CachedEnrichment>();
  const byHash = new Map<string, JobRow>(); // ORDER BY id below, so the newest job wins

  for (const part of chunk([...new Set(contentHashes)], 500)) {
    const { sql, params } = inList('h', part);
    const rows = await query<JobRow>(
      `SELECT id, content_hash, role_category, job_type, work_mode, is_fresher, exp_min_years, exp_max_years,
              stipend_min_monthly_inr, stipend_max_monthly_inr, skills, confidence, tagged_by, prompt_version
       FROM jobs
       WHERE content_hash IN (${sql}) AND needs_review = 0 AND prompt_version IS NOT NULL AND role_category IS NOT NULL
         AND job_type IS NOT NULL AND work_mode IS NOT NULL
       ORDER BY id`,
      params,
    );
    // A result tagged under an older prompt version must not be reused.
    for (const r of rows) if (isCurrentVersion(r.prompt_version)) byHash.set(r.content_hash.trim(), r);
  }

  const cities = new Map<number, string[]>();
  for (const part of chunk([...byHash.values()].map((r) => Number(r.id)), 500)) {
    const { sql, params } = inList('j', part);
    const rows = await query<{ job_id: number; name: string }>(
      `SELECT jc.job_id, c.name FROM job_cities jc JOIN cities c ON c.id = jc.city_id WHERE jc.job_id IN (${sql})`,
      params,
    );
    for (const r of rows) cities.set(Number(r.job_id), [...(cities.get(Number(r.job_id)) ?? []), r.name]);
  }

  for (const [hash, r] of byHash) {
    const found = cities.get(Number(r.id)) ?? [];
    out.set(hash, {
      enrichment: {
        roleCategory: r.role_category,
        cities: found.length === 0 && r.work_mode === 'remote' ? [REMOTE] : found,
        workMode: r.work_mode,
        jobType: r.job_type,
        isFresher: Boolean(r.is_fresher),
        experienceMinYears: r.exp_min_years,
        experienceMaxYears: r.exp_max_years,
        stipendMinMonthlyInr: r.stipend_min_monthly_inr,
        stipendMaxMonthlyInr: r.stipend_max_monthly_inr,
        skills: parseJson<string[]>(r.skills, []),
        confidence: r.confidence ?? 0,
      },
      provenance: parseJson<FieldProvenance>(r.tagged_by, {}),
      promptVersion: r.prompt_version,
    });
  }
  return out;
}

import { query, withTransaction } from '@beep/shared';
import { ApiError } from './errors.ts';

export const ACCURACY_FIELDS = ['role_category', 'cities', 'job_type', 'is_fresher'] as const;
export type AccuracyField = (typeof ACCURACY_FIELDS)[number];

export interface LabelInput {
  jobId: number;
  field: AccuracyField;
  predicted?: string | null;
  correct: boolean;
  correctValue?: string | null;
}

const pct = (correct: number, total: number) => (total === 0 ? null : Math.round((correct / total) * 1000) / 10);

/**
 * How many posts each source contributes to a stratified sample of `size`: proportional to its
 * size, at least one each (while room remains), remainders to the largest fractions.
 */
export function allocateQuotas(counts: Record<string, number>, size: number): Record<string, number> {
  const sources = Object.keys(counts).filter((s) => counts[s]! > 0);
  const total = sources.reduce((n, s) => n + counts[s]!, 0);
  const quotas: Record<string, number> = {};
  if (total === 0 || size <= 0) return quotas;
  const target = Math.min(size, total);
  const exact = Object.fromEntries(sources.map((s) => [s, (counts[s]! / total) * target]));
  let used = 0;
  for (const s of sources) {
    quotas[s] = Math.min(counts[s]!, Math.max(1, Math.floor(exact[s]!)));
    used += quotas[s]!;
  }
  // Hand out leftovers by largest fractional part; take back overshoot from the biggest quotas.
  const byFraction = [...sources].sort((a, b) => exact[b]! - Math.floor(exact[b]!) - (exact[a]! - Math.floor(exact[a]!)));
  for (let i = 0; used < target && i < sources.length * 2; i++) {
    const s = byFraction[i % sources.length]!;
    if (quotas[s]! < counts[s]!) {
      quotas[s]!++;
      used++;
    }
  }
  while (used > target) {
    const s = sources.filter((x) => quotas[x]! > 1).sort((a, b) => quotas[b]! - quotas[a]!)[0];
    if (!s) break;
    quotas[s]!--;
    used--;
  }
  return quotas;
}

/**
 * The hand check measures the shipped tagging chain, so the sample is drawn only from jobs that Jev took part in
 * (prompt_version starts with 'jev'). Jobs tagged by rules alone or by the LLM alone are not what is being measured.
 */
const SAMPLE_WHERE = "status = 'active' AND is_fresher = 1 AND prompt_version LIKE 'jev%'";

export async function sampleForLabelling(size: number) {
  const counts = await query<{ source: string; n: number }>(
    `SELECT primary_source AS source, COUNT(*) AS n FROM jobs WHERE ${SAMPLE_WHERE} GROUP BY primary_source`,
  );
  const quotas = allocateQuotas(Object.fromEntries(counts.map((c) => [c.source, Number(c.n)])), size);
  const maxQuota = Math.max(0, ...Object.values(quotas));
  if (maxQuota === 0) return [];

  const ranked = await query<{ id: number; source: string; rn: number }>(
    `SELECT id, source, rn FROM (
       SELECT id, primary_source AS source, ROW_NUMBER() OVER (PARTITION BY primary_source ORDER BY NEWID()) AS rn
       FROM jobs WHERE ${SAMPLE_WHERE}
     ) t WHERE rn <= @maxQuota`,
    { maxQuota },
  );
  const ids = ranked.filter((r) => r.rn <= (quotas[r.source] ?? 0)).map((r) => Number(r.id));
  if (ids.length === 0) return [];

  const params: Record<string, unknown> = {};
  const ph = ids.map((id, i) => ((params[`id${i}`] = id), `@id${i}`)).join(',');
  const [jobs, cities, labels] = await Promise.all([
    query(
      `SELECT id, title, company, location_raw, LEFT(description, 600) AS excerpt, apply_url, primary_source,
              role_category, job_type, is_fresher, work_mode
       FROM jobs WHERE id IN (${ph})`,
      params,
    ),
    query<{ job_id: number; name: string }>(
      `SELECT jc.job_id, c.name FROM job_cities jc JOIN cities c ON c.id = jc.city_id WHERE jc.job_id IN (${ph}) ORDER BY c.name`,
      params,
    ),
    query<{ job_id: number; field_name: string; correct: boolean; correct_value: string | null }>(
      `SELECT job_id, field_name, correct, correct_value FROM accuracy_labels WHERE job_id IN (${ph})`,
      params,
    ),
  ]);

  return jobs
    .map((j) => ({
      id: Number(j.id),
      title: j.title,
      company: j.company,
      locationRaw: j.location_raw ?? null,
      descriptionExcerpt: (j.excerpt ?? '').replace(/\s+/g, ' ').trim(),
      applyUrl: j.apply_url,
      primarySource: j.primary_source,
      predicted: {
        role_category: j.role_category ?? null,
        cities: cities.filter((c) => Number(c.job_id) === Number(j.id)).map((c) => c.name),
        job_type: j.job_type ?? null,
        is_fresher: !!j.is_fresher,
      },
      workMode: j.work_mode ?? null,
      labels: Object.fromEntries(
        labels
          .filter((l) => Number(l.job_id) === Number(j.id))
          .map((l) => [l.field_name, { correct: !!l.correct, correctValue: l.correct_value }]),
      ),
    }))
    .sort((a, b) => a.primarySource.localeCompare(b.primarySource) || a.id - b.id);
}

export async function upsertLabels(labels: LabelInput[]): Promise<number> {
  // Last write wins when the same (job, field) appears twice in one request.
  const unique = new Map<string, LabelInput>();
  for (const l of labels) unique.set(`${l.jobId}:${l.field}`, l);
  const rows = [...unique.values()];

  const idParams: Record<string, unknown> = {};
  const jobIds = [...new Set(rows.map((r) => r.jobId))];
  const ph = jobIds.map((id, i) => ((idParams[`id${i}`] = id), `@id${i}`)).join(',');
  const existing = await query<{ id: number }>(`SELECT id FROM jobs WHERE id IN (${ph})`, idParams);
  const have = new Set(existing.map((r) => Number(r.id)));
  const missing = jobIds.filter((id) => !have.has(id));
  if (missing.length) throw new ApiError(400, 'UNKNOWN_JOB', `Unknown job id(s): ${missing.join(', ')}`);

  await withTransaction(async (q) => {
    for (const l of rows) {
      await q(
        `MERGE accuracy_labels AS t
         USING (SELECT @jobId AS job_id, @field AS field_name) AS s ON t.job_id = s.job_id AND t.field_name = s.field_name
         WHEN MATCHED THEN UPDATE SET predicted = @predicted, correct = @correct, correct_value = @correctValue, labelled_at = SYSUTCDATETIME()
         WHEN NOT MATCHED THEN INSERT (job_id, field_name, predicted, correct, correct_value) VALUES (@jobId, @field, @predicted, @correct, @correctValue);`,
        {
          jobId: l.jobId,
          field: l.field,
          predicted: l.predicted ?? null,
          correct: l.correct ? 1 : 0,
          correctValue: l.correct ? null : (l.correctValue ?? null),
        },
      );
    }
  });
  return rows.length;
}

export interface FieldAccuracy {
  correct: number;
  total: number;
  percent: number | null;
}

export async function accuracySummary() {
  const rows = await query<{ field_name: string; correct: number; total: number }>(
    `SELECT field_name, SUM(CAST(correct AS INT)) AS correct, COUNT(*) AS total FROM accuracy_labels GROUP BY field_name`,
  );
  const [jobs] = await query<{ n: number }>(`SELECT COUNT(DISTINCT job_id) AS n FROM accuracy_labels`);
  const fields: Record<string, FieldAccuracy> = {};
  let correct = 0;
  let total = 0;
  for (const f of ACCURACY_FIELDS) {
    const r = rows.find((x) => x.field_name === f);
    const c = Number(r?.correct ?? 0);
    const t = Number(r?.total ?? 0);
    fields[f] = { correct: c, total: t, percent: pct(c, t) };
    correct += c;
    total += t;
  }
  return { labelledJobs: Number(jobs?.n ?? 0), fields, overall: { correct, total, percent: pct(correct, total) } };
}

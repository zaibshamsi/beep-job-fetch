import { query } from '@beep/shared';
import type { DedupeRepo, ExistingJob, PoolJob } from './dedupe.ts';
import { chunk, inList, sourceKey } from './util.ts';

type Row = { id: number; primary_source: string; content_hash: string | null };
const toExisting = (r: Row): ExistingJob => ({ id: Number(r.id), primarySource: r.primary_source, contentHash: r.content_hash?.trim() ?? null });

export const dedupeRepo: DedupeRepo = {
  async findBySourceKeys(keys) {
    const out = new Map<string, ExistingJob>();
    const bySource = new Map<string, string[]>();
    for (const k of keys) bySource.set(k.source, [...(bySource.get(k.source) ?? []), k.sourceJobId]);
    for (const [source, ids] of bySource) {
      for (const part of chunk(ids, 500)) {
        const { sql, params } = inList('i', part);
        const rows = await query<Row & { source_job_id: string; is_primary: boolean }>(
          `SELECT j.id, j.primary_source, j.content_hash, js.source_job_id,
                  CASE WHEN js.id = (SELECT MIN(id) FROM job_sources WHERE job_id = j.id) THEN 1 ELSE 0 END AS is_primary
           FROM job_sources js JOIN jobs j ON j.id = js.job_id
           WHERE js.source = @source AND js.source_job_id IN (${sql})`,
          { source, ...params },
        );
        for (const r of rows) out.set(sourceKey(source, r.source_job_id), { ...toExisting(r), isPrimaryLink: Boolean(r.is_primary) });
      }
    }
    return out;
  },

  async findByUrlHashes(hashes) {
    const out = new Map<string, ExistingJob>();
    for (const part of chunk([...new Set(hashes)], 500)) {
      const { sql, params } = inList('h', part);
      const rows = await query<Row & { url_hash: string }>(
        `SELECT id, primary_source, content_hash, url_hash FROM jobs WHERE url_hash IN (${sql})`,
        params,
      );
      for (const r of rows) out.set(r.url_hash.trim(), toExisting(r));
    }
    return out;
  },

  async loadFuzzyPool(companyNorms) {
    const out = new Map<string, PoolJob[]>();
    const byId = new Map<number, PoolJob>();
    for (const part of chunk(companyNorms, 500)) {
      const { sql, params } = inList('c', part);
      const rows = await query<{ id: number; company_norm: string; title_norm: string; location_raw: string | null; len: number }>(
        `SELECT id, company_norm, title_norm, location_raw, LEN(description) AS len
         FROM jobs WHERE status = 'active' AND company_norm IN (${sql})`,
        params,
      );
      for (const r of rows) {
        const job: PoolJob = {
          id: Number(r.id),
          companyNorm: r.company_norm,
          titleNorm: r.title_norm,
          locationRaw: r.location_raw ?? '',
          cities: [],
          descriptionLength: Number(r.len ?? 0),
        };
        byId.set(job.id, job);
        out.set(job.companyNorm, [...(out.get(job.companyNorm) ?? []), job]);
      }
    }
    for (const part of chunk([...byId.keys()], 500)) {
      const { sql, params } = inList('j', part);
      const rows = await query<{ job_id: number; name: string }>(
        `SELECT jc.job_id, c.name FROM job_cities jc JOIN cities c ON c.id = jc.city_id WHERE jc.job_id IN (${sql})`,
        params,
      );
      for (const r of rows) byId.get(Number(r.job_id))?.cities.push(r.name);
    }
    return out;
  },
};

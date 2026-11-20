import { getPool, sha256, sql, type RawPost } from '@beep/shared';
import { chunk } from './util.ts';

export interface RawRow {
  runId: number;
  source: string;
  sourceJobId: string;
  payload: string;
  contentHash: string;
}

export function toRawRows(runId: number, source: string, posts: RawPost[]): RawRow[] {
  return posts.map((p) => {
    const payload = JSON.stringify(p.payload ?? null);
    return { runId, source, sourceJobId: String(p.sourceJobId), payload, contentHash: sha256(payload) };
  });
}

/** Bulk-inserts raw payloads (one round trip per 1000 rows). */
export async function storeRaw(rows: RawRow[]): Promise<void> {
  if (!rows.length) return;
  const pool = await getPool();
  for (const part of chunk(rows, 1000)) {
    const table = new sql.Table('raw_posts');
    table.create = false;
    table.columns.add('run_id', sql.BigInt, { nullable: false });
    table.columns.add('source', sql.NVarChar(60), { nullable: false });
    table.columns.add('source_job_id', sql.NVarChar(300), { nullable: false });
    table.columns.add('payload', sql.NVarChar(sql.MAX), { nullable: false });
    table.columns.add('content_hash', sql.Char(64), { nullable: false });
    for (const r of part) table.rows.add(r.runId, r.source, r.sourceJobId, r.payload, r.contentHash);
    await pool.request().bulk(table);
  }
}

import { createLogger, exec, query, sha256 } from '@beep/shared';
import type { JobFilters } from '@beep/shared';
import { JobFiltersSchema } from '@beep/shared';
import { normaliseQuery } from './rules.ts';

const log = createLogger('ai:search-cache');

export type ParsedBy = 'rules' | 'jev' | 'llm';
/** How capable the layer that produced an entry is; a cached answer is reused only if it is not weaker than what is configured now. */
export const RANK: Record<ParsedBy, number> = { rules: 0, jev: 1, llm: 2 };

export const queryHash = (q: string) => sha256(normaliseQuery(q));

export async function readCache(q: string): Promise<{ filters: JobFilters; parsedBy: ParsedBy } | null> {
  try {
    const hash = queryHash(q);
    const rows = await query<{ filters: string }>(`SELECT filters FROM search_cache WHERE query_hash = @hash`, { hash });
    if (!rows[0]) return null;
    const stored = JSON.parse(rows[0].filters) as { filters?: unknown; parsedBy?: ParsedBy };
    const filters = JobFiltersSchema.safeParse(stored.filters);
    if (!filters.success || !stored.parsedBy || !(stored.parsedBy in RANK)) return null;
    await exec(`UPDATE search_cache SET hits = hits + 1 WHERE query_hash = @hash`, { hash });
    return { filters: filters.data, parsedBy: stored.parsedBy };
  } catch (e) {
    log.warn(`cache read failed: ${(e as Error).message}`);
    return null;
  }
}

export async function writeCache(q: string, filters: JobFilters, parsedBy: ParsedBy): Promise<void> {
  try {
    await exec(
      `MERGE search_cache AS t USING (SELECT @hash AS query_hash) AS s ON t.query_hash = s.query_hash
       WHEN MATCHED THEN UPDATE SET filters = @filters, query_text = @text, created_at = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (query_hash, query_text, filters) VALUES (@hash, @text, @filters);`,
      { hash: queryHash(q), text: normaliseQuery(q).slice(0, 500), filters: JSON.stringify({ filters, parsedBy }) },
    );
  } catch (e) {
    log.warn(`cache write failed: ${(e as Error).message}`);
  }
}

import type { SourceAdapter } from '@beep/shared';
import { exec, query } from '@beep/shared';

/** Writes each adapter's meta into `sources`. New rows start enabled; existing `enabled` flags are never touched. */
export async function syncSourceMeta(adapters: SourceAdapter[]): Promise<void> {
  for (const a of adapters) {
    await exec(
      `MERGE sources AS t
       USING (SELECT @name AS name) AS s ON t.name = s.name
       WHEN MATCHED THEN UPDATE SET description=@description, homepage=@homepage, access_method=@access,
         terms_url=@termsUrl, terms_status=@termsStatus, terms_notes=@termsNotes
       WHEN NOT MATCHED THEN INSERT (name, description, homepage, access_method, terms_url, terms_status, terms_notes)
         VALUES (@name, @description, @homepage, @access, @termsUrl, @termsStatus, @termsNotes);`,
      {
        name: a.name,
        description: a.description.slice(0, 400),
        homepage: a.meta.homepage.slice(0, 400),
        access: a.meta.accessMethod,
        termsUrl: a.meta.termsUrl,
        termsStatus: a.meta.termsStatus,
        termsNotes: a.meta.termsNotes,
      },
    );
  }
}

export async function loadEnabled(): Promise<Map<string, boolean>> {
  const rows = await query<{ name: string; enabled: boolean }>('SELECT name, enabled FROM sources');
  return new Map(rows.map((r) => [r.name, Boolean(r.enabled)]));
}

export type SourceRunStatus = 'ok' | 'error' | 'skipped';

/** robots.txt is only consulted by politeFetch for HTML-style sources, so only those get a fresh robots timestamp. */
export async function recordSourceRun(adapter: SourceAdapter, status: SourceRunStatus): Promise<void> {
  const robots = status !== 'skipped' && ['html', 'jsonld'].includes(adapter.meta.accessMethod);
  await exec(
    `UPDATE sources SET last_run_at = SYSUTCDATETIME(), last_status = @status,
       robots_checked_at = CASE WHEN @robots = 1 THEN SYSUTCDATETIME() ELSE robots_checked_at END
     WHERE name = @name`,
    { name: adapter.name, status, robots: robots ? 1 : 0 },
  );
}

import { exec, query } from '@beep/shared';
import type { WorkerStats } from './types.ts';

export type RunStatus = 'success' | 'partial' | 'failed';

/**
 * Starts a run atomically: adopts the queued row `runId`, or inserts a new 'running' row.
 * Returns null when another run is already 'running'.
 */
export async function claimRun(trigger: string, runId?: number): Promise<number | null> {
  const rows = runId
    ? await query<{ id: number }>(
        `UPDATE pipeline_runs SET status = 'running', stage = 'starting', started_at = SYSUTCDATETIME()
         OUTPUT inserted.id
         WHERE id = @runId AND status = 'queued'
           AND NOT EXISTS (SELECT 1 FROM pipeline_runs WHERE status = 'running')`,
        { runId },
      )
    : await query<{ id: number }>(
        `INSERT INTO pipeline_runs (trigger_type, status, stage)
         OUTPUT inserted.id
         SELECT @trigger, 'running', 'starting'
         WHERE NOT EXISTS (SELECT 1 FROM pipeline_runs WHERE status = 'running')`,
        { trigger },
      );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function setStage(runId: number, stage: string): Promise<void> {
  await exec('UPDATE pipeline_runs SET stage = @stage WHERE id = @runId', { runId, stage });
}

export async function finishRun(runId: number, status: RunStatus, stats: WorkerStats, error?: string): Promise<void> {
  await exec(
    `UPDATE pipeline_runs SET status = @status, stage = NULL, finished_at = SYSUTCDATETIME(), stats = @stats, error = @error
     WHERE id = @runId`,
    { runId, status, stats: JSON.stringify(stats), error: error ?? null },
  );
}

export async function activeRunId(): Promise<number | null> {
  const rows = await query<{ id: number }>("SELECT TOP 1 id FROM pipeline_runs WHERE status = 'running' ORDER BY id");
  return rows[0] ? Number(rows[0].id) : null;
}

export async function nextQueuedRunId(): Promise<{ id: number; trigger: string } | null> {
  const rows = await query<{ id: number; trigger_type: string }>(
    "SELECT TOP 1 id, trigger_type FROM pipeline_runs WHERE status = 'queued' ORDER BY id",
  );
  return rows[0] ? { id: Number(rows[0].id), trigger: rows[0].trigger_type } : null;
}

/** On worker start nothing of ours is running, so any 'running' row is left over from a crash. */
export async function failStaleRuns(): Promise<number> {
  return exec(
    `UPDATE pipeline_runs SET status = 'failed', stage = NULL, finished_at = SYSUTCDATETIME(), error = 'worker restarted while run was in progress'
     WHERE status = 'running'`,
  );
}

export async function jobsTableEmpty(): Promise<boolean> {
  const rows = await query<{ n: number }>('SELECT COUNT(*) AS n FROM jobs');
  return Number(rows[0]?.n ?? 0) === 0;
}

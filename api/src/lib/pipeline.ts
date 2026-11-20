import { query, type RunStats } from '@beep/shared';
import { parseJson } from './jobs.ts';

export interface RunInfo {
  id: number;
  triggerType: string;
  status: string;
  stage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  stats: Partial<RunStats> | null;
  error: string | null;
}

export function toRunInfo(r: Record<string, any>, now = Date.now()): RunInfo {
  const started = new Date(r.started_at).getTime();
  const finished = r.finished_at ? new Date(r.finished_at).getTime() : null;
  return {
    id: Number(r.id),
    triggerType: r.trigger_type,
    status: r.status,
    stage: r.stage ?? null,
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: finished ? new Date(finished).toISOString() : null,
    durationMs: Math.max(0, (finished ?? now) - started),
    stats: parseJson<Partial<RunStats> | null>(r.stats, null),
    error: r.error ?? null,
  };
}

const RUN_COLUMNS = 'id, trigger_type, status, stage, started_at, finished_at, stats, error';

export async function listRuns(limit: number): Promise<RunInfo[]> {
  const rows = await query(`SELECT TOP (@limit) ${RUN_COLUMNS} FROM pipeline_runs ORDER BY id DESC`, { limit });
  return rows.map((r) => toRunInfo(r));
}

export async function getRun(id: number): Promise<RunInfo | null> {
  const rows = await query(`SELECT ${RUN_COLUMNS} FROM pipeline_runs WHERE id = @id`, { id });
  return rows[0] ? toRunInfo(rows[0]) : null;
}

export interface StartResult {
  started: boolean;
  runId: number;
}

/**
 * Queue a manual run unless one is already queued or running. The check and the insert share one
 * transaction with an update lock, so two simultaneous requests cannot both queue a run.
 */
export async function startManualRun(): Promise<StartResult> {
  const rows = await query<{ activeId: number | null; newId: number | null }>(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     DECLARE @active BIGINT = (SELECT TOP 1 id FROM pipeline_runs WITH (UPDLOCK, HOLDLOCK) WHERE status IN ('queued', 'running') ORDER BY id DESC);
     DECLARE @new BIGINT = NULL;
     IF @active IS NULL
     BEGIN
       INSERT INTO pipeline_runs (trigger_type, status) VALUES ('manual', 'queued');
       SET @new = SCOPE_IDENTITY();
     END
     COMMIT;
     SELECT @active AS activeId, @new AS newId;`,
  );
  const r = rows[0];
  if (r?.activeId != null) return { started: false, runId: Number(r.activeId) };
  return { started: true, runId: Number(r!.newId) };
}

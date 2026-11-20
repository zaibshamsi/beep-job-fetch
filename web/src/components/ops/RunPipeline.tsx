import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, X } from 'lucide-react';
import { ApiError } from '../../api/client.ts';
import type { PipelineRun } from '../../api/types.ts';
import { formatDuration, formatInt } from './format.ts';
import { opsApi } from './opsApi.ts';
import { ErrorBlock, Spinner } from './States.tsx';
import { RunStatusLabel, STAGES, STAGE_LABEL } from './StatusLabel.tsx';

const isLive = (r: PipelineRun | undefined | null) => !!r && (r.status === 'queued' || r.status === 'running');

export interface RunControl {
  runId: number | null;
  run: PipelineRun | undefined;
  live: boolean;
  starting: boolean;
  start: () => void;
  notice: string | null;
  error: unknown;
  finished: PipelineRun | null;
  dismiss: () => void;
}

/**
 * Starts a run (POST /pipeline/run) or attaches to the one already going (409 or `activeRun` from /stats), polls
 * GET /pipeline/runs/:id every 2 s until it ends, then refetches /stats and keeps the result on screen.
 */
export function useRunPipeline(activeRun?: PipelineRun | null): RunControl {
  const qc = useQueryClient();
  const [runId, setRunId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [finished, setFinished] = useState<PipelineRun | null>(null);
  const sawLive = useRef(false);
  const ended = useRef(new Set<number>());

  // attach to a run that /stats reports as queued or running (unless we already saw that run end)
  useEffect(() => {
    if (runId == null && activeRun && isLive(activeRun) && !ended.current.has(activeRun.id)) setRunId(activeRun.id);
  }, [activeRun, runId]);

  const runQ = useQuery({
    queryKey: ['ops', 'run', runId],
    queryFn: () => opsApi.run(runId!),
    enabled: runId != null,
    refetchInterval: (q) => (q.state.data && !isLive(q.state.data) ? false : 2000),
    staleTime: 0,
  });
  const run = runQ.data;

  useEffect(() => {
    if (!run) return;
    if (isLive(run)) {
      sawLive.current = true;
      return;
    }
    ended.current.add(run.id);
    if (sawLive.current) {
      sawLive.current = false;
      setFinished(run);
      setNotice(null);
      setRunId(null);
      void qc.invalidateQueries({ queryKey: ['stats'] });
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['cities'] });
      void qc.invalidateQueries({ queryKey: ['filterOptions'] });
    } else {
      setRunId(null);
      void qc.invalidateQueries({ queryKey: ['stats'] });
    }
  }, [run, qc]);

  const startM = useMutation({
    mutationFn: opsApi.startRun,
    onMutate: () => {
      setNotice(null);
      setFinished(null);
    },
    onSuccess: ({ runId: id }) => {
      sawLive.current = true;
      setRunId(id);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && err.body?.runId) {
        sawLive.current = true;
        setNotice(`A run is already in progress (#${err.body.runId}). Showing its progress.`);
        setRunId(err.body.runId);
      }
    },
  });

  const conflict = startM.error instanceof ApiError && startM.error.status === 409;
  const live = runId != null && (run ? isLive(run) || run.id !== runId : true);

  return {
    runId,
    run: run && run.id === runId ? run : undefined,
    live,
    starting: startM.isPending,
    start: () => startM.mutate(),
    notice,
    error: conflict ? null : (startM.error ?? (runQ.error && runId != null ? runQ.error : null)),
    finished,
    dismiss: () => setFinished(null),
  };
}

export function RunPipelineButton({ ctl }: { ctl: RunControl }) {
  const busy = ctl.starting || ctl.live;
  return (
    <button
      type="button"
      className="btn btn--primary"
      onClick={ctl.start}
      disabled={busy}
      aria-busy={busy}
      aria-describedby={ctl.live ? 'ops-run-progress' : undefined}
    >
      {busy ? <Spinner /> : <Play size={16} aria-hidden="true" />}
      Run pipeline
    </button>
  );
}

/** Live stage and counters while a run is going, then its result until dismissed. Renders nothing otherwise. */
export function RunProgress({ ctl }: { ctl: RunControl }) {
  const { run, live, finished, notice, error } = ctl;
  if (error) return <ErrorBlock error={error} onRetry={ctl.start} />;
  if (live) {
    const stage = run?.stage ?? 'starting';
    const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
    const s = run?.stats ?? {};
    const counts: [string, number | undefined][] = [
      ['Fetched', s.fetched],
      ['Rejected', s.rejected],
      ['Not fresher', s.notFresher],
      ['New', s.newJobs],
      ['Updated', s.updatedJobs],
    ];
    return (
      <section className="ops-run" id="ops-run-progress" aria-live="polite" aria-label="Pipeline run in progress">
        {notice && <p className="ops-run__notice">{notice}</p>}
        <div className="ops-run__head">
          <p className="ops-run__title">
            <Spinner />
            <span>
              Run <span className="mono">#{ctl.runId}</span>: {run?.status === 'queued' ? 'waiting for the worker' : (STAGE_LABEL[stage] ?? stage)}
            </span>
          </p>
          <p className="ops-run__time num">{run?.durationMs != null ? formatDuration(run.durationMs) : 'Starting…'}</p>
        </div>
        <ol className="ops-steps" aria-label="Stages">
          {STAGES.map((st, i) => {
            const state = idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'now' : 'todo';
            return (
              <li key={st} className={`ops-steps__item is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
                <span className="ops-steps__bar" aria-hidden="true" />
                <span className="ops-steps__label">
                  {STAGE_LABEL[st]}
                  <span className="visually-hidden">{state === 'done' ? ', done' : state === 'now' ? ', running' : ''}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <dl className="ops-run__counts">
          {counts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="num mono">{v == null ? '–' : formatInt(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="ops-run__note">A full run takes about 13 minutes. You can leave this page; the run keeps going on the worker.</p>
      </section>
    );
  }
  if (finished) {
    const s = finished.stats ?? {};
    return (
      <section className="ops-run ops-run--done" aria-live="polite" aria-label="Pipeline run finished">
        <div className="ops-run__head">
          <p className="ops-run__title">
            <span>
              Run <span className="mono">#{finished.id}</span> finished
            </span>
            <RunStatusLabel status={finished.status} />
          </p>
          <button type="button" className="ops-icon-btn" onClick={ctl.dismiss} aria-label="Dismiss run result">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="ops-run__summary">
          {formatInt(s.newJobs ?? 0)} new jobs, {formatInt(s.updatedJobs ?? 0)} updated, {formatInt(s.needsReview ?? 0)} marked
          for review, in {formatDuration(finished.durationMs)}. The numbers below are refreshed.
          {finished.error && <> Error: {finished.error}</>}
        </p>
      </section>
    );
  }
  return null;
}

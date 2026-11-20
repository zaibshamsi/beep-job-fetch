import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStats } from '../api/queries.ts';
import type { LlmUsageRow, PipelineRun, SourceStatus, Stats } from '../api/types.ts';
import { BarList } from '../components/ops/BarList.tsx';
import { DataTable, type Column } from '../components/ops/DataTable.tsx';
import { formatDateTime, formatDuration, formatInt, formatPercent, formatRate, formatRelative, formatUsd, plural } from '../components/ops/format.ts';
import { Funnel, type FunnelStep } from '../components/ops/Funnel.tsx';
import { KpiCard } from '../components/ops/KpiCard.tsx';
import { PageHead, SectionHead } from '../components/ops/PageHead.tsx';
import type { RunStatsExtra } from '../components/ops/opsApi.ts';
import { RunPipelineButton, RunProgress, useRunPipeline } from '../components/ops/RunPipeline.tsx';
import { Empty, ErrorBlock, SkeletonRows, useDelayedFlag } from '../components/ops/States.tsx';
import { RunStatusLabel, STAGES, STAGE_LABEL, StatusLabel, TermsStatusLabel, TRIGGER_LABEL } from '../components/ops/StatusLabel.tsx';
import '../components/ops/ops.css';

const PURPOSE_LABEL: Record<string, string> = {
  tag_jev: 'Tagging, first pass',
  tag_llm: 'Tagging, escalated',
  search_parse: 'Search parsing',
  test: 'Connection test',
};
const PROVIDER_LABEL: Record<string, string> = { jev: 'Jev', llm: 'LLM (Azure)' };

export function InsightsPage() {
  const stats = useStats();
  const ctl = useRunPipeline(stats.data?.activeRun);
  const showSkeleton = useDelayedFlag(stats.isPending);
  const s = stats.data;

  return (
    <div className="wrap ops-page">
      <PageHead eyebrow="Insights · Data health" title="Data health and" accent="accuracy" action={<RunPipelineButton ctl={ctl} />}>
        <LastRunFact stats={s} pending={stats.isPending} />
      </PageHead>
      <RunProgress ctl={ctl} />

      {stats.isError && !s ? (
        <div className="ops-section">
          <ErrorBlock error={stats.error} onRetry={() => void stats.refetch()} />
        </div>
      ) : (
        <>
          <Kpis s={s} loading={showSkeleton || !s} />
          <LastRunSection s={s} loading={showSkeleton || !s} />
          <SourcesSection s={s} loading={showSkeleton || !s} />
          <RecentRunsSection s={s} loading={showSkeleton || !s} />
          <section className="ops-section ops-cols" aria-label="Jobs by role and by city">
            <div>
              <SectionHead
                eyebrow="04 · Roles"
                title="Jobs by"
                accent="role"
                meta={s && `Top 10 of ${formatInt(s.totals.byRole.length)} roles`}
              />
              <div className="card ops-panel">
                {!s ? (
                  <SkeletonRows rows={10} h={24} />
                ) : s.totals.byRole.length === 0 ? (
                  <Empty title="No active jobs yet.">Run the pipeline to fetch posts.</Empty>
                ) : (
                  <BarList
                    caption="Active fresher jobs by role category"
                    items={s.totals.byRole.map((r) => ({ label: r.role, value: r.count }))}
                    total={s.totals.activeJobs}
                    colorBy="role"
                  />
                )}
              </div>
            </div>
            <div>
              <SectionHead eyebrow="05 · Cities" title="Jobs by" accent="city" meta={s && 'A post open in several cities counts in each'} />
              <div className="card ops-panel">
                {!s ? (
                  <SkeletonRows rows={10} h={24} />
                ) : s.totals.byCity.length === 0 ? (
                  <Empty title="No jobs with a city yet.">Remote-only posts have no city.</Empty>
                ) : (
                  <BarList
                    caption="Active fresher jobs by city"
                    items={s.totals.byCity.map((c) => ({ label: c.city, value: c.count }))}
                    total={s.totals.activeJobs}
                  />
                )}
              </div>
            </div>
          </section>
          <AiUsageSection s={s} loading={showSkeleton || !s} />
        </>
      )}
    </div>
  );
}

function LastRunFact({ stats, pending }: { stats: Stats | undefined; pending: boolean }) {
  if (pending) return <p className="ops-fact">Loading the last run…</p>;
  if (!stats) return <p className="ops-fact">Could not load the last run.</p>;
  const r = stats.lastRun;
  if (!r) return <p className="ops-fact">No pipeline run yet. Run it once to fill this page.</p>;
  return (
    <p className="ops-fact">
      <span>
        Last run <strong className="mono">#{r.id}</strong>
      </span>
      <RunStatusLabel status={r.status} />
      <span>
        finished <strong>{formatDateTime(r.finishedAt ?? r.startedAt)}</strong> ({formatRelative(r.finishedAt ?? r.startedAt)})
      </span>
      <span>took {formatDuration(r.durationMs)}</span>
    </p>
  );
}

function Kpis({ s, loading }: { s: Stats | undefined; loading: boolean }) {
  const contributing = s ? s.totals.bySource.filter((x) => x.count > 0).length : 0;
  const lastPer = s?.lastRun?.stats?.perSource ?? {};
  const skipped = Object.values(lastPer).filter((p) => p.skipped).length;
  const errored = Object.values(lastPer).filter((p) => p.error).length;
  const t = s?.costPer1000.tagging ?? null;
  const acc = s?.accuracy;
  return (
    <section className="ops-kpis" aria-label="Key numbers">
      <KpiCard
        accent
        loading={loading}
        label="Active fresher jobs"
        value={s ? formatInt(s.totals.activeJobs) : null}
        sub={s ? `${formatInt(s.totals.needsReview)} marked for review` : undefined}
      />
      <KpiCard
        loading={loading}
        label="New today"
        value={s ? formatInt(s.totals.newToday) : null}
        sub="First seen in the last 24 hours"
      />
      <KpiCard
        loading={loading}
        label="Sources contributing"
        value={s ? formatInt(contributing) : null}
        unit={s ? `of ${formatInt(s.sources.length)}` : undefined}
        sub={s ? `Last run: ${formatInt(skipped)} skipped, ${formatInt(errored)} with an error` : undefined}
      />
      <KpiCard
        loading={loading}
        label="Cost per 1,000 posts"
        value={t ? formatUsd(t.per1000Posts, 4) : null}
        sub={
          t
            ? `Jev ${formatUsd(t.jevCostUsd)} · LLM ${formatUsd(t.llmCostUsd)} · ${formatRate(t.escalationRate)} sent to the LLM`
            : 'No AI tagging has run yet, so there is no cost to measure.'
        }
        footer={t ? undefined : <Link to="/settings">Add an AI key</Link>}
      />
      <KpiCard
        loading={loading}
        label="Tagging accuracy"
        value={acc?.overall.percent != null ? formatPercent(acc.overall.percent) : null}
        sub={
          acc && acc.overall.total > 0
            ? `${formatInt(acc.overall.correct)} of ${formatInt(acc.overall.total)} fields right on ${plural(acc.labelledJobs, 'hand-checked post')}`
            : 'Check 50 posts by hand to measure it.'
        }
        footer={<Link to="/review">{acc && acc.overall.total > 0 ? 'Continue the hand check' : 'Start the hand check'}</Link>}
      />
    </section>
  );
}

function LastRunSection({ s, loading }: { s: Stats | undefined; loading: boolean }) {
  const r = s?.lastRun ?? null;
  const st = (r?.stats ?? {}) as NonNullable<PipelineRun['stats']> & RunStatsExtra;
  const steps: FunnelStep[] = r
    ? [
        { label: 'Fetched', value: st.fetched ?? 0, kind: 'kept' },
        { label: 'Rejected', value: st.rejected ?? 0, kind: 'removed', hint: 'Could not be read as a job post' },
        { label: 'Not fresher', value: st.notFresher ?? 0, kind: 'removed', hint: 'Senior, or asks for more than 1 year of experience' },
        {
          label: 'Duplicates merged',
          value: (st.duplicatesExact ?? 0) + (st.duplicatesFuzzy ?? 0),
          kind: 'removed',
          hint: `${formatInt(st.duplicatesExact ?? 0)} exact, ${formatInt(st.duplicatesFuzzy ?? 0)} near-identical`,
        },
        {
          label: 'New or updated',
          value: (st.newJobs ?? 0) + (st.updatedJobs ?? 0),
          kind: 'kept',
          hint: `${formatInt(st.newJobs ?? 0)} new, ${formatInt(st.updatedJobs ?? 0)} updated`,
        },
        { label: 'Needs review', value: st.needsReview ?? 0, kind: 'flag', hint: 'Tags a person should check' },
      ]
    : [];
  const stageMs = st.stageMs ?? {};
  const maxStage = Math.max(1, ...Object.values(stageMs));
  return (
    <section className="ops-section" aria-labelledby="ops-lastrun-h">
      <SectionHead
        eyebrow="01 · Last run"
        title="What the last run"
        accent="did"
        id="ops-lastrun-h"
        meta={r && `${TRIGGER_LABEL[r.triggerType] ?? r.triggerType} run, started ${formatDateTime(r.startedAt)}`}
      />
      <div className="ops-cols ops-cols--wide">
        <div className="card ops-panel">
          <p className="ops-panel__title">What happened to each post</p>
          {loading ? (
            <SkeletonRows rows={6} h={28} />
          ) : !r ? (
            <Empty title="No finished run yet.">Press Run pipeline above. A full run takes about 13 minutes.</Empty>
          ) : (
            <Funnel steps={steps} caption={`Run ${r.id}: posts at each stage`} />
          )}
        </div>
        <div className="card ops-panel">
          <p className="ops-panel__title">Time per stage</p>
          {loading ? (
            <SkeletonRows rows={6} h={20} />
          ) : !r || Object.keys(stageMs).length === 0 ? (
            <Empty title="No stage timings for this run." />
          ) : (
            <>
              <ul className="ops-acc" aria-label="Time per stage">
                {STAGES.filter((k) => stageMs[k] != null).map((k) => (
                  <li key={k}>
                    <span className="ops-acc__name">{STAGE_LABEL[k]}</span>
                    <span className="ops-acc__pct num">{formatDuration(stageMs[k])}</span>
                    <span className="ops-acc__track" aria-hidden="true">
                      <span className="ops-acc__bar" style={{ width: `${(stageMs[k]! / maxStage) * 100}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
              <dl className="ops-provider__key" style={{ marginTop: 24 }}>
                <dt>Total</dt>
                <dd className="num">{formatDuration(r.durationMs)}</dd>
                <dt>Tagged by</dt>
                <dd className="num">
                  rules {formatInt(st.taggedByRules ?? 0)} · Jev {formatInt(st.taggedByJev ?? 0)} · LLM {formatInt(st.taggedByLlm ?? 0)}
                </dd>
                <dt>Expired</dt>
                <dd className="num">{plural(st.expiredJobs ?? 0, 'post')}</dd>
                {r.error && (
                  <>
                    <dt>Error</dt>
                    <dd>{r.error}</dd>
                  </>
                )}
              </dl>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function sourceRunState(src: SourceStatus) {
  const lr = src.lastRun;
  if (!lr) return { tone: 'neutral' as const, label: 'Not run yet', reason: null as string | null };
  if (lr.error) return { tone: 'err' as const, label: 'Error', reason: lr.error };
  if (lr.skipped) return { tone: 'neutral' as const, label: 'Skipped', reason: lr.skipped };
  return { tone: 'ok' as const, label: 'Fetched', reason: null };
}

function SourcesSection({ s, loading }: { s: Stats | undefined; loading: boolean }) {
  const columns = useMemo<Column<SourceStatus>[]>(
    () => [
      {
        key: 'name',
        header: 'Source',
        sortValue: (r) => r.name,
        render: (r) => (
          <span className="mono" translate="no">
            {r.name}
          </span>
        ),
      },
      { key: 'terms', header: 'Terms', sortValue: (r) => r.termsStatus, render: (r) => <TermsStatusLabel status={r.termsStatus} /> },
      { key: 'active', header: 'Active jobs', align: 'right', mono: true, sortValue: (r) => r.activeJobs, render: (r) => formatInt(r.activeJobs) },
      { key: 'fetched', header: 'Fetched', align: 'right', mono: true, sortValue: (r) => r.lastRun?.fetched, render: (r) => formatInt(r.lastRun?.fetched) },
      {
        key: 'normalized',
        header: 'Normalized',
        align: 'right',
        mono: true,
        sortValue: (r) => r.lastRun?.normalized,
        render: (r) => formatInt(r.lastRun?.normalized),
      },
      { key: 'rejected', header: 'Rejected', align: 'right', mono: true, sortValue: (r) => r.lastRun?.rejected, render: (r) => formatInt(r.lastRun?.rejected) },
      { key: 'ms', header: 'Time', align: 'right', mono: true, sortValue: (r) => r.lastRun?.ms, render: (r) => (r.lastRun?.ms ? formatDuration(r.lastRun.ms) : '–') },
      {
        key: 'state',
        header: 'Last run',
        sortValue: (r) => sourceRunState(r).label,
        render: (r) => {
          const x = sourceRunState(r);
          return (
            <>
              <StatusLabel tone={x.tone}>{x.label}</StatusLabel>
              {x.reason && <span className="ops-sub">{x.reason}</span>}
            </>
          );
        },
      },
    ],
    [],
  );
  const withJobs = s ? s.sources.filter((x) => x.activeJobs > 0).length : 0;
  return (
    <section className="ops-section" aria-labelledby="ops-sources-h">
      <SectionHead
        eyebrow="02 · Sources"
        title="Sources we read,"
        accent="sites we skip"
        id="ops-sources-h"
        meta={s && `${formatInt(s.sources.length)} sources, ${formatInt(withJobs)} with active jobs. Open a row for its terms.`}
      />
      {loading ? (
        <div className="card ops-panel">
          <SkeletonRows rows={8} h={28} />
        </div>
      ) : !s || s.sources.length === 0 ? (
        <Empty title="No sources registered yet.">The worker registers its sources on its first run.</Empty>
      ) : (
        <DataTable
          caption="Sources, their terms status and their counts in the last run"
          columns={columns}
          rows={s.sources}
          rowKey={(r) => r.name}
          initialSort={{ key: 'active', dir: 'desc' }}
          expandLabel={(r) => `Show terms for ${r.name}`}
          expand={(r) => <SourceDetail src={r} />}
        />
      )}
    </section>
  );
}

function SourceDetail({ src }: { src: SourceStatus }) {
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: '84ch' }}>
      {src.description && <p>{src.description}</p>}
      {src.termsNotes && <p className="ops-note">{src.termsNotes}</p>}
      <p className="ops-note" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {src.termsUrl ? (
          <a className="ops-link" href={src.termsUrl} target="_blank" rel="noopener noreferrer">
            Read the terms
          </a>
        ) : (
          <span>No terms page recorded</span>
        )}
        {src.homepage && (
          <a className="ops-link" href={src.homepage} target="_blank" rel="noopener noreferrer">
            Open {src.name}
          </a>
        )}
        {src.accessMethod && <span>Access: {src.accessMethod.replace(/_/g, ' ')}</span>}
        {src.robotsCheckedAt && <span>robots.txt checked {formatDateTime(src.robotsCheckedAt)}</span>}
        {!src.enabled && <span>Turned off</span>}
      </p>
    </div>
  );
}

function RecentRunsSection({ s, loading }: { s: Stats | undefined; loading: boolean }) {
  const columns = useMemo<Column<PipelineRun>[]>(
    () => [
      { key: 'id', header: 'Run', mono: true, sortValue: (r) => r.id, render: (r) => `#${r.id}` },
      { key: 'trigger', header: 'Trigger', render: (r) => TRIGGER_LABEL[r.triggerType] ?? r.triggerType },
      { key: 'status', header: 'Status', render: (r) => <RunStatusLabel status={r.status} /> },
      {
        key: 'started',
        header: 'Started',
        sortValue: (r) => r.startedAt,
        render: (r) => (
          <>
            <span className="num" style={{ whiteSpace: 'nowrap' }}>
              {formatDateTime(r.startedAt)}
            </span>
            <span className="ops-sub">{formatRelative(r.startedAt)}</span>
          </>
        ),
      },
      { key: 'duration', header: 'Duration', align: 'right', mono: true, sortValue: (r) => r.durationMs, render: (r) => formatDuration(r.durationMs) },
      { key: 'new', header: 'New jobs', align: 'right', mono: true, sortValue: (r) => r.stats?.newJobs, render: (r) => formatInt(r.stats?.newJobs) },
      { key: 'updated', header: 'Updated', align: 'right', mono: true, sortValue: (r) => r.stats?.updatedJobs, render: (r) => formatInt(r.stats?.updatedJobs) },
    ],
    [],
  );
  return (
    <section className="ops-section" aria-labelledby="ops-runs-h">
      <SectionHead
        eyebrow="03 · History"
        title="Recent"
        accent="runs"
        id="ops-runs-h"
        meta={s && s.recentRuns.length > 0 ? `Last ${formatInt(s.recentRuns.length)}, newest first` : undefined}
      />
      {loading ? (
        <div className="card ops-panel">
          <SkeletonRows rows={4} h={28} />
        </div>
      ) : !s || s.recentRuns.length === 0 ? (
        <Empty title="No runs yet.">The worker runs every morning at 06:00 IST, or press Run pipeline.</Empty>
      ) : (
        <DataTable caption="Recent pipeline runs" columns={columns} rows={s.recentRuns} rowKey={(r) => r.id} />
      )}
    </section>
  );
}

function AiUsageSection({ s, loading }: { s: Stats | undefined; loading: boolean }) {
  const columns = useMemo<Column<LlmUsageRow>[]>(
    () => [
      { key: 'provider', header: 'Provider', sortValue: (r) => r.provider, render: (r) => PROVIDER_LABEL[r.provider] ?? r.provider },
      { key: 'model', header: 'Model', render: (r) => <span className="mono">{r.model}</span> },
      { key: 'purpose', header: 'Purpose', sortValue: (r) => r.purpose, render: (r) => PURPOSE_LABEL[r.purpose] ?? r.purpose },
      { key: 'calls', header: 'Calls', align: 'right', mono: true, sortValue: (r) => r.calls, render: (r) => formatInt(r.calls) },
      { key: 'failures', header: 'Failures', align: 'right', mono: true, sortValue: (r) => r.failures, render: (r) => formatInt(r.failures) },
      { key: 'in', header: 'Input tokens', align: 'right', mono: true, sortValue: (r) => r.inputTokens, render: (r) => formatInt(r.inputTokens) },
      { key: 'out', header: 'Output tokens', align: 'right', mono: true, sortValue: (r) => r.outputTokens, render: (r) => formatInt(r.outputTokens) },
      { key: 'cached', header: 'Cached tokens', align: 'right', mono: true, sortValue: (r) => r.cachedTokens, render: (r) => formatInt(r.cachedTokens) },
      { key: 'cost', header: 'Cost', align: 'right', mono: true, sortValue: (r) => r.costUsd, render: (r) => formatUsd(r.costUsd) },
      {
        key: 'lat',
        header: 'Avg latency',
        align: 'right',
        mono: true,
        sortValue: (r) => r.avgLatencyMs,
        render: (r) => formatDuration(r.avgLatencyMs),
      },
    ],
    [],
  );
  const u = s?.llmUsage;
  const search = s?.costPer1000.search ?? null;
  return (
    <section className="ops-section" aria-labelledby="ops-ai-h">
      <SectionHead
        eyebrow="06 · AI"
        title="What the AI"
        accent="cost"
        id="ops-ai-h"
        meta={
          u && u.totals.calls > 0 ? (
            <>
              {plural(u.totals.calls, 'call')}, {formatUsd(u.totals.costUsd)} in total
              {search && <> · search parsing {formatUsd(search.per1000Searches)} per 1,000 searches</>}
            </>
          ) : undefined
        }
      />
      {loading ? (
        <div className="card ops-panel">
          <SkeletonRows rows={3} h={28} />
        </div>
      ) : !u || u.byModel.length === 0 ? (
        <Empty title="No AI calls yet.">
          Jobs are tagged by rules only. <Link className="ops-link" to="/settings">Add a Jev or LLM key in Settings</Link>, then run the
          pipeline to see calls, tokens and cost here.
        </Empty>
      ) : (
        <DataTable
          caption="AI calls by provider, model and purpose"
          columns={columns}
          rows={u.byModel}
          rowKey={(r) => `${r.provider}/${r.model}/${r.purpose}`}
          initialSort={{ key: 'cost', dir: 'desc' }}
        />
      )}
    </section>
  );
}

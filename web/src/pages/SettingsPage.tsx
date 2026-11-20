import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useStats } from '../api/queries.ts';
import type { AiStatus } from '../api/types.ts';
import { useToast } from '../components/ops/Feedback.tsx';
import { aiModeLine, formatDuration } from '../components/ops/format.ts';
import { opsApi } from '../components/ops/opsApi.ts';
import { PageHead, SectionHead } from '../components/ops/PageHead.tsx';
import { ProviderCard } from '../components/ops/ProviderCard.tsx';
import { RunPipelineButton, RunProgress, useRunPipeline } from '../components/ops/RunPipeline.tsx';
import { ErrorBlock, Skeleton, useDelayedFlag } from '../components/ops/States.tsx';
import { StatusLabel, type Tone } from '../components/ops/StatusLabel.tsx';
import '../components/ops/ops.css';

const MODE_TONE: Record<AiStatus['mode'], Tone> = { full: 'ok', jev_only: 'ok', llm_only: 'ok', rules_only: 'warn' };

export function SettingsPage() {
  const ai = useQuery({ queryKey: ['ops', 'aiStatus'], queryFn: opsApi.aiStatus });
  const stats = useStats();
  const ctl = useRunPipeline(stats.data?.activeRun);
  const toast = useToast();
  const showSkeleton = useDelayedFlag(ai.isPending);
  const s = ai.data;
  const lastMs = stats.data?.lastRun?.durationMs;

  return (
    <div className="wrap ops-page">
      <PageHead eyebrow="Settings · AI tagging" title="Who tags" accent="your jobs">
        {s ? (
          <p className="ops-fact">
            <span>Tagging mode</span>
            <StatusLabel tone={MODE_TONE[s.mode]}>{aiModeLine(s.mode)}</StatusLabel>
          </p>
        ) : ai.isPending ? (
          <p className="ops-fact" aria-label="Loading tagging mode">
            {showSkeleton && <Skeleton h={20} w={280} />}
          </p>
        ) : null}
      </PageHead>

      {ai.isError && !s ? (
        <div className="ops-section">
          <ErrorBlock error={ai.error} onRetry={() => void ai.refetch()} />
        </div>
      ) : !s ? (
        <div className="ops-providers">
          {[0, 1].map((i) => (
            <div key={i} className="card ops-provider" aria-hidden={!showSkeleton}>
              {showSkeleton && (
                <>
                  <Skeleton h={26} w="55%" />
                  <Skeleton h={48} />
                  <Skeleton h={56} />
                  <Skeleton h={44} />
                  <Skeleton h={44} />
                  <Skeleton h={44} w="60%" />
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          {s.mode === 'rules_only' && (
            <div className="ops-banner" role="note">
              <p className="ops-banner__title">AI tagging is off.</p>
              <p>
                Jobs are tagged by rules only, and every post the rules cannot settle is marked for review. Add a Jev key, an LLM key or
                both below, then run the pipeline to tag the posts again.
              </p>
            </div>
          )}
          <div className="ops-providers">
            <ProviderCard provider="jev" status={s.jev} onSaved={toast.show} />
            <ProviderCard provider="llm" status={s.llm} onSaved={toast.show} />
          </div>
        </>
      )}

      <section className="ops-section" aria-labelledby="ops-run-h">
        <div className="card ops-panel">
          <div className="ops-runbox">
            <div style={{ display: 'grid', gap: 8 }}>
              <SectionHead eyebrow="03 · Run" title="Run the pipeline" accent="now" id="ops-run-h" />
              <p className="ops-note">
                Fetches every source again, tags new posts with the keys above and re-tags older posts that were tagged without them.
                {lastMs ? ` The last run took ${formatDuration(lastMs)}.` : ' A full run takes about 13 minutes.'} Progress also shows
                on <Link className="ops-link" to="/insights">Insights</Link>.
              </p>
            </div>
            <RunPipelineButton ctl={ctl} />
          </div>
          <RunProgress ctl={ctl} />
        </div>
      </section>
      {toast.node}
    </div>
  );
}

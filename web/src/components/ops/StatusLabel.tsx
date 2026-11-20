import type { ReactNode } from 'react';
import type { RunStatus, SourceStatus } from '../../api/types.ts';

export type Tone = 'ok' | 'warn' | 'err' | 'neutral' | 'active';

const TAG_CLASS: Record<Tone, string> = {
  ok: 'tag ok',
  warn: 'tag warn',
  err: 'tag no',
  active: 'tag warn ops-tag--live',
  neutral: 'tag ops-tag--mute',
};

/** A tinted tag with a text label. The colour never carries the meaning alone. */
export function StatusLabel({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`${TAG_CLASS[tone]} ops-tag`} title={title}>
      {children}
    </span>
  );
}

export const RUN_STATUS: Record<RunStatus, { tone: Tone; label: string }> = {
  queued: { tone: 'neutral', label: 'Queued' },
  running: { tone: 'active', label: 'Running' },
  success: { tone: 'ok', label: 'Succeeded' },
  partial: { tone: 'warn', label: 'Partly failed' },
  failed: { tone: 'err', label: 'Failed' },
};

export function RunStatusLabel({ status }: { status: RunStatus }) {
  const s = RUN_STATUS[status] ?? { tone: 'neutral' as Tone, label: status };
  return <StatusLabel tone={s.tone}>{s.label}</StatusLabel>;
}

export const TERMS_STATUS: Record<SourceStatus['termsStatus'], { tone: Tone; label: string }> = {
  allowed: { tone: 'ok', label: 'Allowed' },
  allowed_with_limits: { tone: 'ok', label: 'Allowed with limits' },
  unclear: { tone: 'warn', label: 'Unclear, not fetched' },
  forbidden: { tone: 'err', label: 'Forbidden' },
  unchecked: { tone: 'neutral', label: 'Not checked' },
};

export function TermsStatusLabel({ status }: { status: SourceStatus['termsStatus'] }) {
  const s = TERMS_STATUS[status] ?? { tone: 'neutral' as Tone, label: status };
  return <StatusLabel tone={s.tone}>{s.label}</StatusLabel>;
}

export const TRIGGER_LABEL: Record<string, string> = { cron: 'Daily schedule', manual: 'Manual', startup: 'On start-up' };

export const STAGE_LABEL: Record<string, string> = {
  starting: 'Starting',
  fetch: 'Fetching from sources',
  normalize: 'Cleaning and fresher filter',
  dedupe: 'Merging duplicates',
  enrich: 'Tagging with AI',
  publish: 'Publishing',
  lifecycle: 'Expiring old posts',
  done: 'Done',
};
export const STAGES = ['fetch', 'normalize', 'dedupe', 'enrich', 'publish', 'lifecycle'] as const;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, ExternalLink } from 'lucide-react';
import { JOB_TYPE_LABEL, type JobType } from '../api/types.ts';
import { ConfirmDialog } from '../components/ops/Feedback.tsx';
import { PageHead } from '../components/ops/PageHead.tsx';
import { formatDate, formatInt, formatPercent, toCsv } from '../components/ops/format.ts';
import { FIELD_LABEL, LabelRow, type Draft } from '../components/ops/LabelRow.tsx';
import {
  ACCURACY_FIELDS,
  opsApi,
  type AccuracyField,
  type AccuracySample,
  type AccuracySummary,
  type LabelInput,
  type SampleItem,
} from '../components/ops/opsApi.ts';
import { Empty, ErrorBlock, Skeleton, SkeletonRows, Spinner, useDelayedFlag } from '../components/ops/States.tsx';
import '../components/ops/ops.css';

const STORE_KEY = 'beep.review.v1';
const SAMPLE_SIZE = 50;

type Drafts = Record<number, Partial<Record<AccuracyField, Draft>>>;
interface Session {
  drawnAt: string;
  sample: AccuracySample;
  drafts: Drafts;
  index: number;
}

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s?.sample?.items?.length ? s : null;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage blocked: progress lives in the database only */
  }
}

function draftsFromSample(sample: AccuracySample): Drafts {
  const d: Drafts = {};
  for (const it of sample.items) {
    d[it.id] = {};
    for (const f of ACCURACY_FIELDS) {
      const l = it.labels?.[f];
      if (l) d[it.id]![f] = { correct: l.correct, correctValue: l.correctValue ?? '' };
    }
  }
  return d;
}

/** The predicted value as the person reads it, and as it is stored. */
function predicted(it: SampleItem, f: AccuracyField): { shown: string; raw: string | null; empty: boolean } {
  const p = it.predicted;
  switch (f) {
    case 'role_category':
      return p.role_category ? { shown: p.role_category, raw: p.role_category, empty: false } : { shown: 'Not tagged', raw: null, empty: true };
    case 'cities':
      if (p.cities.length) return { shown: p.cities.join(', '), raw: p.cities.join(', '), empty: false };
      return it.workMode === 'remote' ? { shown: 'Remote (no city)', raw: 'Remote', empty: false } : { shown: 'No city found', raw: null, empty: true };
    case 'job_type':
      return p.job_type
        ? { shown: JOB_TYPE_LABEL[p.job_type as JobType] ?? p.job_type, raw: p.job_type, empty: false }
        : { shown: 'Not tagged', raw: null, empty: true };
    case 'is_fresher':
      return p.is_fresher == null
        ? { shown: 'Not decided', raw: null, empty: true }
        : { shown: p.is_fresher ? 'Yes, fresher post' : 'No', raw: String(p.is_fresher), empty: false };
  }
}

function toLabel(it: SampleItem, f: AccuracyField, d: Draft): LabelInput {
  const pr = predicted(it, f).raw;
  let correctValue: string | null = null;
  if (d.correct === false) {
    correctValue = f === 'is_fresher' ? String(!(it.predicted.is_fresher ?? false)) : d.correctValue.trim() || null;
  }
  return { jobId: it.id, field: f, predicted: pr, correct: d.correct === true, correctValue };
}

const isDone = (d: Partial<Record<AccuracyField, Draft>> | undefined) => ACCURACY_FIELDS.every((f) => d?.[f]?.correct != null);
const isStarted = (d: Partial<Record<AccuracyField, Draft>> | undefined) => ACCURACY_FIELDS.some((f) => d?.[f]?.correct != null);

type SaveState = { kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; error: unknown };

export function ReviewPage() {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [confirmNew, setConfirmNew] = useState(false);

  // a fresh sample only when there is no session in this browser
  const sampleQ = useQuery({
    queryKey: ['ops', 'sample', SAMPLE_SIZE],
    queryFn: () => opsApi.sample(SAMPLE_SIZE),
    enabled: session == null,
    staleTime: Infinity,
    gcTime: 0,
  });
  useEffect(() => {
    if (session == null && sampleQ.data) {
      setSession({ drawnAt: new Date().toISOString(), sample: sampleQ.data, drafts: draftsFromSample(sampleQ.data), index: 0 });
    }
  }, [sampleQ.data, session]);

  useEffect(() => saveSession(session), [session]);

  const summaryQ = useQuery({ queryKey: ['ops', 'accSummary'], queryFn: opsApi.accuracySummary });

  // ---------------------------------------------------------------- autosave (debounced batch PUT)
  const dirty = useRef(new Set<string>());
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const s = sessionRef.current;
    if (!s || dirty.current.size === 0) return;
    const keys = [...dirty.current];
    dirty.current.clear();
    const byId = new Map(s.sample.items.map((i) => [i.id, i]));
    const labels: LabelInput[] = [];
    for (const k of keys) {
      const [id, f] = k.split(':') as [string, AccuracyField];
      const it = byId.get(Number(id));
      const d = s.drafts[Number(id)]?.[f];
      if (it && d && d.correct != null) labels.push(toLabel(it, f, d));
    }
    if (!labels.length) return;
    setSave({ kind: 'saving' });
    try {
      await opsApi.saveLabels(labels);
      setSave(dirty.current.size ? { kind: 'saving' } : { kind: 'saved' });
      void qc.invalidateQueries({ queryKey: ['ops', 'accSummary'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    } catch (error) {
      for (const k of keys) dirty.current.add(k);
      setSave({ kind: 'error', error });
    }
  }, [qc]);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 800);
  }, [flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      void flush();
    };
  }, [flush]);

  // ---------------------------------------------------------------- editing
  const items = session?.sample.items ?? [];
  const index = Math.min(session?.index ?? 0, Math.max(0, items.length - 1));
  const item = items[index];

  const setDraft = useCallback(
    (jobId: number, f: AccuracyField, d: Draft) => {
      setSession((s) => (s ? { ...s, drafts: { ...s.drafts, [jobId]: { ...s.drafts[jobId], [f]: d } } } : s));
      dirty.current.add(`${jobId}:${f}`);
      schedule();
    },
    [schedule],
  );
  const go = useCallback((i: number) => {
    setSession((s) => (s ? { ...s, index: Math.max(0, Math.min(s.sample.items.length - 1, i)) } : s));
    void flush();
  }, [flush]);

  const fixRefs = useRef<Partial<Record<AccuracyField, HTMLInputElement | HTMLSelectElement | null>>>({});
  const pendingFocus = useRef<AccuracyField | null>(null);
  useEffect(() => {
    const f = pendingFocus.current;
    if (f) {
      pendingFocus.current = null;
      fixRefs.current[f]?.focus();
    }
  });

  // keyboard: 1-8 choose, A all correct, arrows / Enter move
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!session || !item || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.closest('input, select, textarea, [contenteditable="true"]') || t.closest('dialog'))) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 8) {
        e.preventDefault();
        const f = ACCURACY_FIELDS[Math.floor((n - 1) / 2)]!;
        const correct = n % 2 === 1;
        const prev = session.drafts[item.id]?.[f];
        setDraft(item.id, f, { correct, correctValue: correct ? '' : (prev?.correctValue ?? '') });
        if (!correct && f !== 'is_fresher') pendingFocus.current = f;
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        for (const f of ACCURACY_FIELDS) {
          if (session.drafts[item.id]?.[f]?.correct == null) setDraft(item.id, f, { correct: true, correctValue: '' });
        }
      } else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !(t && t.closest('button, a')))) {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, item, index, setDraft, go]);

  const doneCount = useMemo(() => items.filter((i) => isDone(session?.drafts[i.id])).length, [items, session]);

  const downloadCsv = () => {
    if (!session) return;
    const header = ['job_id', 'source', 'title', 'company', 'location', 'apply_url'];
    for (const f of ACCURACY_FIELDS) header.push(`${f}_predicted`, `${f}_correct`, `${f}_right_value`);
    const rows = session.sample.items.map((it) => {
      const row: unknown[] = [it.id, it.primarySource, it.title, it.company, it.locationRaw ?? '', it.applyUrl ?? ''];
      for (const f of ACCURACY_FIELDS) {
        const d = session.drafts[it.id]?.[f];
        const l = d && d.correct != null ? toLabel(it, f, d) : null;
        row.push(predicted(it, f).raw ?? '', l ? (l.correct ? 'TRUE' : 'FALSE') : '', l?.correctValue ?? '');
      }
      return row;
    });
    const blob = new Blob(['﻿' + toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `beepjobfetch-accuracy-${session.sample.items.length}-${session.drawnAt.slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const newSample = async () => {
    await flush();
    setConfirmNew(false);
    setSession(null);
    qc.removeQueries({ queryKey: ['ops', 'sample'] });
  };

  const showSkeleton = useDelayedFlag(session == null && sampleQ.isFetching);

  return (
    <div className="wrap ops-page">
      <PageHead eyebrow="Review · Hand check" title="Tagging" accent="review">
        <p className="ops-fact">
          {session ? (
            <>
              <span>
                <strong>{formatInt(items.length)}</strong> random active posts, drawn {formatDate(session.drawnAt)}
              </span>
              <span>Each answer saves as you go and counts on <Link className="ops-link" to="/insights">Insights</Link></span>
            </>
          ) : (
            <span>Check {SAMPLE_SIZE} random posts by hand: is each predicted field right?</span>
          )}
        </p>
      </PageHead>

      {session == null ? (
        sampleQ.isError ? (
          <div className="ops-section">
            <ErrorBlock error={sampleQ.error} onRetry={() => void sampleQ.refetch()} />
          </div>
        ) : sampleQ.data && sampleQ.data.items.length === 0 ? (
          <div className="ops-section">
            <Empty title="No active fresher posts to sample.">Run the pipeline from Insights first, then come back.</Empty>
          </div>
        ) : (
          <div className="ops-review" aria-busy="true">
            <div className="card ops-panel">{showSkeleton && <SkeletonRows rows={8} h={32} label="Drawing a sample" />}</div>
            <div className="card ops-panel">{showSkeleton && <SkeletonRows rows={5} h={20} />}</div>
          </div>
        )
      ) : (
        <>
          <div className="ops-progress">
            <div className="ops-progress__line">
              <p className="ops-progress__count" aria-live="polite">
                {formatInt(doneCount)} of {formatInt(items.length)} checked
              </p>
              <SaveStatus save={save} onRetry={() => void flush()} />
            </div>
            <ol className="ops-dots" aria-label="Posts in this sample">
              {items.map((it, i) => {
                const d = session.drafts[it.id];
                const state = isDone(d) ? 'is-done' : isStarted(d) ? 'is-partial' : '';
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      className={`${state}${i === index ? ' is-current' : ''}`}
                      aria-label={`Post ${i + 1}: ${it.title}${state === 'is-done' ? ', checked' : state ? ', started' : ''}`}
                      aria-current={i === index ? 'step' : undefined}
                      onClick={() => go(i)}
                    />
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="ops-review">
            <div>
              {item && (
                <article className="card ops-panel ops-post" aria-labelledby="ops-post-title">
                  <p className="ops-post__meta">
                    <span>
                      Post {formatInt(index + 1)} of {formatInt(items.length)}
                    </span>
                    <span>
                      via <span translate="no">{item.primarySource}</span>
                    </span>
                    <span className="mono">#{item.id}</span>
                  </p>
                  <h2 className="ops-post__title" id="ops-post-title">
                    {item.title}
                  </h2>
                  <p className="ops-post__company">
                    {item.company}
                    {item.locationRaw && <span className="ops-section__meta"> · {item.locationRaw}</span>}
                  </p>
                  <p className="ops-post__excerpt" tabIndex={0} aria-label="Description excerpt">
                    {item.descriptionExcerpt || 'No description text.'}
                  </p>
                  {item.applyUrl && (
                    <p>
                      <a className="ops-link" href={item.applyUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        Open the post on {item.primarySource}
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </p>
                  )}

                  <div className="ops-fields" aria-label="Predicted fields">
                    {ACCURACY_FIELDS.map((f, i) => {
                      const p = predicted(item, f);
                      return (
                        <LabelRow
                          key={`${item.id}-${f}`}
                          ref={(el) => {
                            fixRefs.current[f] = el;
                          }}
                          field={f}
                          index={i}
                          shown={p.shown}
                          isEmpty={p.empty}
                          draft={session.drafts[item.id]?.[f] ?? { correct: null, correctValue: '' }}
                          autoValueText={item.predicted.is_fresher ? 'not a fresher post' : 'a fresher post'}
                          onChange={(d) => setDraft(item.id, f, d)}
                        />
                      );
                    })}
                  </div>

                  <div className="ops-review__nav">
                    <div className="ops-review__nav-btns">
                      <button type="button" className="btn btn--secondary" onClick={() => go(index - 1)} disabled={index === 0}>
                        Previous post
                      </button>
                      <button type="button" className="btn btn--primary" onClick={() => go(index + 1)} disabled={index >= items.length - 1}>
                        Next post
                      </button>
                    </div>
                    {doneCount === items.length && (
                      <p className="ops-note" role="status">
                        All {formatInt(items.length)} posts checked. Download the CSV for the Sheet.
                      </p>
                    )}
                  </div>
                </article>
              )}
            </div>

            <aside className="ops-review__aside" aria-label="Accuracy and shortcuts">
              <AccuracyPanel q={summaryQ} />
              <div className="card ops-panel">
                <p className="ops-panel__title">Export</p>
                <div style={{ display: 'grid', gap: 12 }}>
                  <button type="button" className="btn btn--secondary" onClick={downloadCsv}>
                    <Download size={16} aria-hidden="true" />
                    Download CSV
                  </button>
                  <p className="ops-hint">One row per post with each field’s prediction, your answer and the right value, ready for the Accuracy-50 tab.</p>
                  <button type="button" className="ops-linkbtn" onClick={() => setConfirmNew(true)}>
                    Draw a new sample
                  </button>
                </div>
              </div>
              <div className="card ops-panel ops-keys-panel">
                <p className="ops-panel__title">Keyboard</p>
                <dl className="ops-keys">
                  <dt>
                    <kbd>1</kbd> <kbd>2</kbd>
                  </dt>
                  <dd>Role correct / wrong</dd>
                  <dt>
                    <kbd>3</kbd> <kbd>4</kbd>
                  </dt>
                  <dd>Cities correct / wrong</dd>
                  <dt>
                    <kbd>5</kbd> <kbd>6</kbd>
                  </dt>
                  <dd>Job type correct / wrong</dd>
                  <dt>
                    <kbd>7</kbd> <kbd>8</kbd>
                  </dt>
                  <dd>For freshers correct / wrong</dd>
                  <dt>
                    <kbd>A</kbd>
                  </dt>
                  <dd>Mark every open field correct</dd>
                  <dt>
                    <kbd>→</kbd> <kbd>Enter</kbd>
                  </dt>
                  <dd>Next post</dd>
                  <dt>
                    <kbd>←</kbd>
                  </dt>
                  <dd>Previous post</dd>
                </dl>
                <p className="ops-hint" style={{ marginTop: 12 }}>
                  After Wrong, type or pick the right value, then press Tab or Esc to get back to the keys.
                </p>
              </div>
            </aside>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmNew}
        title="Draw a new sample?"
        confirmLabel="Draw new sample"
        onCancel={() => setConfirmNew(false)}
        onConfirm={() => void newSample()}
      >
        <p>
          You get {SAMPLE_SIZE} other random posts. Answers you already gave stay saved and keep counting in the accuracy; only the list in this
          browser is replaced.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function SaveStatus({ save, onRetry }: { save: SaveState; onRetry: () => void }) {
  if (save.kind === 'saving')
    return (
      <span className="ops-save" role="status">
        <Spinner /> Saving…
      </span>
    );
  if (save.kind === 'saved')
    return (
      <span className="ops-save" role="status">
        All answers saved
      </span>
    );
  if (save.kind === 'error')
    return (
      <div style={{ flexBasis: '100%' }}>
        <ErrorBlock error={save.error} onRetry={onRetry} compact />
      </div>
    );
  return <span className="ops-save">Answers save as you go</span>;
}

function AccuracyPanel({ q }: { q: UseQueryResult<AccuracySummary> }) {
  const show = useDelayedFlag(q.isPending);
  const s = q.data;
  return (
    <section className="card ops-panel" aria-labelledby="ops-acc-h" aria-live="polite">
      <h2 className="ops-panel__title" id="ops-acc-h">
        Accuracy so far
      </h2>
      {q.isError && !s ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} compact />
      ) : !s ? (
        show ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <Skeleton h={28} w="50%" />
            <SkeletonRows rows={4} h={18} />
          </div>
        ) : null
      ) : s.overall.total === 0 ? (
        <p className="ops-note">No answers saved yet. Mark the first post and the numbers appear here.</p>
      ) : (
        <>
          <div className="ops-acc__overall">
            <span>
              Overall
              <span className="ops-sub">
                {formatInt(s.overall.correct)} of {formatInt(s.overall.total)} fields, {formatInt(s.labelledJobs)} posts
              </span>
            </span>
            <span className="ops-acc__big g">{formatPercent(s.overall.percent)}</span>
          </div>
          <ul className="ops-acc">
            {ACCURACY_FIELDS.map((f) => {
              const x = s.fields[f] ?? { correct: 0, total: 0, percent: null };
              return (
                <li key={f}>
                  <span className="ops-acc__name">{FIELD_LABEL[f]}</span>
                  <span className="ops-acc__pct">{x.percent == null ? '–' : formatPercent(x.percent)}</span>
                  <span className="ops-acc__track" aria-hidden="true">
                    <span className="ops-acc__bar" style={{ width: `${x.percent ?? 0}%` }} />
                  </span>
                  <span className="ops-acc__sub">
                    {formatInt(x.correct)} of {formatInt(x.total)} right
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

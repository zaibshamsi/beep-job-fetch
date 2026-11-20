import { createLogger, type JobPost, type SourceAdapter } from '@beep/shared';
import { loadAdapters } from '../sources/registry.ts';
import { dedupeStage, makeCandidate } from './dedupe.ts';
import { dedupeRepo } from './dedupe-repo.ts';
import { enrichStage, type EnrichFn } from './enrich.ts';
import { loadTagCache } from './enrich-cache.ts';
import { fetchStage } from './fetch.ts';
import { fresherFilter, type FresherCheck } from './fresher.ts';
import { aiConfigured, listRetagCandidates, retagJobs, selectRetag } from './retag.ts';
import { runLifecycle, sourcesFetchedOk } from './lifecycle.ts';
import { normalizeRaw } from './normalize.ts';
import { publishStage } from './publish.ts';
import { storeRaw, toRawRows } from './raw.ts';
import { claimRun, finishRun, setStage, type RunStatus } from './runs-repo.ts';
import { loadEnabled, recordSourceRun, syncSourceMeta } from './sources-repo.ts';
import { emptyWorkerStats, REJECTED_SAMPLE_CAP, type Candidate, type Enriched, type WorkerStats } from './types.ts';
import { errMsg } from './util.ts';

const log = createLogger('pipeline');

export interface RunOptions {
  trigger: 'cron' | 'manual' | 'startup';
  /** Adopt this queued pipeline_runs row instead of creating one. */
  runId?: number;
  /** Test hooks. Production uses the registry, the AI package and the settings from env. */
  adapters?: SourceAdapter[];
  enrich?: EnrichFn;
  fresherCheck?: FresherCheck;
  maxPostsPerSource?: number;
  /** Cap on known jobs re-enriched per run (default env RETAG_LIMIT or 2000); 0 turns re-tagging off. */
  retagLimit?: number;
  signal?: AbortSignal;
}

export interface RunOutcome {
  runId: number;
  status: RunStatus;
  stats: WorkerStats;
}

let running = false;

/** True while this process is executing a run. */
export const isRunning = () => running;

/** Runs the whole pipeline once. Returns null if another run is active (in this process or in the DB). */
export async function runPipeline(opts: RunOptions): Promise<RunOutcome | null> {
  if (running) {
    log.warn('a run is already in progress in this process; skipping');
    return null;
  }
  running = true;
  try {
    const runId = await claimRun(opts.trigger, opts.runId);
    if (runId === null) {
      log.warn('another run is already active (or the queued row was taken); skipping');
      return null;
    }
    return await execute(runId, opts);
  } finally {
    running = false;
  }
}

export function runStatus(perSource: WorkerStats['perSource']): RunStatus {
  const attempted = Object.values(perSource).filter((s) => !s.skipped);
  const errored = attempted.filter((s) => s.error).length;
  if (attempted.length > 0 && errored === attempted.length) return 'failed';
  return errored > 0 ? 'partial' : 'success';
}

async function execute(runId: number, o: RunOptions): Promise<RunOutcome> {
  const started = Date.now();
  const stats = emptyWorkerStats();
  const noteRejected = (reasons: string[]) => {
    for (const r of reasons) if (stats.rejectedSample.length < REJECTED_SAMPLE_CAP) stats.rejectedSample.push(r);
  };
  const stage = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
    o.signal?.throwIfAborted();
    await setStage(runId, name);
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      stats.stageMs[name] = Date.now() - t0;
    }
  };

  log.info(`run ${runId} started (${o.trigger})`);
  try {
    // ---- fetch + store raw ----
    const maxPosts = o.maxPostsPerSource ?? (Number(process.env.MAX_POSTS_PER_SOURCE) || 1500);
    const adapters = o.adapters ?? (await loadAdapters());
    const fetched = await stage('fetch', async () => {
      await syncSourceMeta(adapters);
      const enabled = await loadEnabled();
      const results = await fetchStage(adapters, { runId, log, maxPostsPerSource: maxPosts, enabled, signal: o.signal });
      for (const r of results) {
        const name = r.adapter.name;
        stats.perSource[name] = { fetched: r.posts.length, normalized: 0, rejected: 0, ms: r.ms };
        if (r.error) stats.perSource[name].error = r.error;
        if (r.skipped) stats.perSource[name].skipped = r.skipped;
        stats.fetched += r.posts.length;
        await recordSourceRun(r.adapter, r.error ? 'error' : r.skipped ? 'skipped' : 'ok');
        try {
          await storeRaw(toRawRows(runId, name, r.posts));
        } catch (e) {
          log.warn(`could not store raw posts for ${name}: ${errMsg(e)}`);
        }
      }
      log.info(`fetch done: ${stats.fetched} raw posts from ${results.filter((r) => !r.error && !r.skipped).length} sources`);
      return results;
    });

    // ---- normalize + fresher filter ----
    const kept = await stage('normalize', () => {
      const posts: JobPost[] = [];
      for (const r of fetched) {
        const res = normalizeRaw(r.adapter, r.posts);
        const s = stats.perSource[r.adapter.name]!;
        s.normalized = res.posts.length;
        s.rejected = res.rejected;
        stats.rejected += res.rejected;
        noteRejected(res.reasons);
        posts.push(...res.posts);
      }
      const f = fresherFilter(posts, o.fresherCheck);
      stats.notFresher = f.dropped;
      log.info(`normalize done: ${posts.length} ok, ${stats.rejected} rejected; fresher filter dropped ${f.dropped}, kept ${f.kept.length}`);
      return f.kept;
    });

    // ---- dedupe ----
    const dd = await stage('dedupe', async () => {
      const res = await dedupeStage(
        kept.map((k) => makeCandidate(k.post, k.verdict)),
        dedupeRepo,
      );
      stats.duplicatesExact = res.duplicatesExact;
      stats.duplicatesFuzzy = res.duplicatesFuzzy;
      log.info(
        `dedupe done: ${res.fresh.length} new, ${res.touches.length} known jobs seen again, ` +
          `${res.duplicatesExact} exact + ${res.duplicatesFuzzy} fuzzy duplicates merged`,
      );
      return res;
    });

    // Known jobs with stale tags (old prompt version, or flagged and providers now configured) get another pass.
    const retagStale = async (exclude: number[]) => {
      const limit = o.retagLimit ?? (Number(process.env.RETAG_LIMIT ?? 2000) || 0);
      if (limit <= 0) return;
      const known = await listRetagCandidates();
      const ids = selectRetag(known, { mode: 'stale', aiConfigured: await aiConfigured(), limit });
      if (!ids.length) return;
      log.info(`re-tagging ${ids.length} known jobs with stale tags`);
      const sum = await retagJobs(ids, new Map(known.map((k) => [k.id, k])), {
        runId,
        enrich: o.enrich,
        adapters: new Map(adapters.map((a) => [a.name, a])),
        exclude: new Set(exclude),
      });
      stats.retagged = sum.retagged;
    };

    // ---- enrich ----
    const refreshes = dd.touches.filter((t) => t.refresh);
    const toEnrich: Candidate[] = [...dd.fresh, ...refreshes.map((t) => t.refresh!)];
    const enriched = await stage('enrich', async () => {
      let cache;
      try {
        cache = await loadTagCache(toEnrich.map((c) => c.contentHash));
      } catch (e) {
        log.warn(`tag cache unavailable: ${errMsg(e)}`);
      }
      const res = await enrichStage(toEnrich, {
        runId,
        enrich: o.enrich,
        jobIds: new Map(refreshes.map((t) => [t.refresh!, t.jobId])),
        cache,
        onError: (cand, msg) => {
          log.warn(`enrichment failed for "${cand.post.title}", saved rule-only: ${msg}`);
        },
      });
      stats.cacheHits = res.cacheHits;
      stats.enrichFailures = res.failures;
      for (const it of res.items) {
        if (it.fromCache) continue;
        if (it.used.jev) stats.taggedByJev++;
        if (it.used.llm) stats.taggedByLlm++;
        if (!it.used.jev && !it.used.llm) stats.taggedByRules++;
        if (it.needsReview) stats.needsReview++;
      }
      await retagStale(refreshes.map((t) => t.jobId));
      log.info(`enrich done: ${res.items.length} posts (${res.cacheHits} from tag cache, ${res.failures} failed -> rule-only)`);
      return res.items;
    });
    const byCand = new Map<Candidate, Enriched>(enriched.map((e) => [e.cand, e]));

    // ---- publish ----
    await stage('publish', async () => {
      const res = await publishStage({
        inserts: dd.fresh.map((c) => byCand.get(c)!),
        updates: refreshes.map((t) => ({ jobId: t.jobId, item: byCand.get(t.refresh!)!, links: t.links })),
        touches: dd.touches.filter((t) => !t.refresh),
      });
      stats.newJobs = res.newJobs;
      stats.updatedJobs = res.updatedJobs;
      stats.rejected += res.failed.length;
      noteRejected(res.failed.map((f) => `publish "${f.title}": ${f.error}`));
      for (const f of res.failed) log.error(`publish failed for "${f.title}": ${f.error}`);
      log.info(`publish done: ${res.newJobs} new, ${res.updatedJobs} updated, ${res.failed.length} failed`);
    });

    // ---- lifecycle ----
    const status = runStatus(stats.perSource);
    if (status !== 'failed') {
      await stage('lifecycle', async () => {
        stats.expiredJobs = await runLifecycle(runId, sourcesFetchedOk(stats.perSource));
        log.info(`lifecycle done: ${stats.expiredJobs} jobs expired`);
      });
    }

    stats.durationMs = Date.now() - started;
    await finishRun(runId, status, stats);
    log.info(`run ${runId} ${status} in ${(stats.durationMs / 1000).toFixed(1)} s`);
    return { runId, status, stats };
  } catch (e) {
    stats.durationMs = Date.now() - started;
    log.error(`run ${runId} failed: ${errMsg(e)}`);
    await finishRun(runId, 'failed', stats, errMsg(e));
    return { runId, status: 'failed', stats };
  }
}

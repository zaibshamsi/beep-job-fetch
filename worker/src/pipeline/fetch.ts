import type { Logger, RawPost, SourceAdapter } from '@beep/shared';
import pLimit from 'p-limit';
import { errMsg } from './util.ts';

export interface SourceFetch {
  adapter: SourceAdapter;
  posts: RawPost[];
  ms: number;
  error?: string;
  skipped?: string;
}

export interface FetchOptions {
  runId: number;
  log: Logger;
  maxPostsPerSource: number;
  enabled: Map<string, boolean>;
  concurrency?: number;
  /** Per-adapter wall-clock cap so one hung source cannot hold the run. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Why an adapter must not run now, or null if it may. */
export function skipReason(adapter: SourceAdapter, enabled: Map<string, boolean>): string | null {
  const t = adapter.meta.termsStatus;
  if (t === 'forbidden' || t === 'unclear') return `terms status is ${t}`;
  if (enabled.get(adapter.name) === false) return 'disabled in sources table';
  try {
    return adapter.unavailableReason();
  } catch (e) {
    return `unavailableReason threw: ${errMsg(e)}`;
  }
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, parent?: AbortSignal): Promise<T> {
  const ctl = new AbortController();
  const signal = parent ? AbortSignal.any([ctl.signal, parent]) : ctl.signal;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.abort();
      reject(new Error(`timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  try {
    return await Promise.race([work(signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchStage(adapters: SourceAdapter[], o: FetchOptions): Promise<SourceFetch[]> {
  const limit = pLimit(o.concurrency ?? 4);
  const timeoutMs = o.timeoutMs ?? 10 * 60_000;
  return Promise.all(
    adapters.map((adapter) =>
      limit(async (): Promise<SourceFetch> => {
        const skipped = skipReason(adapter, o.enabled);
        if (skipped) {
          o.log.info(`skip ${adapter.name}: ${skipped}`);
          return { adapter, posts: [], ms: 0, skipped };
        }
        const t0 = Date.now();
        try {
          const raw = await withTimeout(
            (signal) => adapter.fetch({ runId: o.runId, log: o.log, maxPostsPerSource: o.maxPostsPerSource, signal }),
            timeoutMs,
            o.signal,
          );
          const posts = raw.slice(0, o.maxPostsPerSource);
          const ms = Date.now() - t0;
          o.log.info(`fetched ${posts.length} from ${adapter.name} in ${ms} ms`);
          return { adapter, posts, ms };
        } catch (e) {
          const ms = Date.now() - t0;
          o.log.error(`source ${adapter.name} failed: ${errMsg(e)}`);
          return { adapter, posts: [], ms, error: errMsg(e) };
        }
      }),
    ),
  );
}

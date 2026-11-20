import cron from 'node-cron';
import { closePool, createLogger } from '@beep/shared';
import { isRunning, runPipeline, type RunOptions } from './pipeline/run.ts';
import { failStaleRuns, jobsTableEmpty, nextQueuedRunId } from './pipeline/runs-repo.ts';

const log = createLogger('worker');
const POLL_MS = 5000;

const shutdown = new AbortController();
let current: Promise<unknown> = Promise.resolve();

/** Starts a run unless one is already going; never throws. */
function launch(opts: RunOptions): void {
  if (isRunning() || shutdown.signal.aborted) return;
  current = runPipeline({ ...opts, signal: shutdown.signal }).catch((e) => log.error('run crashed', e));
}

async function pollQueue(): Promise<void> {
  if (isRunning() || shutdown.signal.aborted) return;
  try {
    const next = await nextQueuedRunId();
    if (!next) return;
    log.info(`picking up queued run ${next.id}`);
    const trigger = next.trigger === 'cron' || next.trigger === 'startup' ? next.trigger : 'manual';
    launch({ trigger, runId: next.id });
  } catch (e) {
    log.error('queue poll failed', e);
  }
}

async function once(): Promise<number> {
  const out = await runPipeline({ trigger: 'manual', signal: shutdown.signal });
  if (!out) {
    log.error('another run is already active; nothing to do');
    return 1;
  }
  log.info(`stats for run ${out.runId}: ${JSON.stringify(out.stats)}`);
  return out.status === 'failed' ? 1 : 0;
}

async function serve(): Promise<void> {
  const stale = await failStaleRuns();
  if (stale) log.warn(`marked ${stale} stale running row(s) as failed`);

  const task = cron.schedule('0 6 * * *', () => launch({ trigger: 'cron' }), { timezone: 'Asia/Kolkata' });
  const timer = setInterval(() => void pollQueue(), POLL_MS);
  log.info('worker up: daily run at 06:00 Asia/Kolkata, polling for queued runs every 5 s');

  if (await jobsTableEmpty()) {
    log.info('jobs table is empty; running once on startup');
    launch({ trigger: 'startup' });
  }

  await new Promise<void>((resolve) => shutdown.signal.addEventListener('abort', () => resolve(), { once: true }));
  clearInterval(timer);
  void task.stop();
  log.info('shutting down: waiting for the current run to stop');
  await current;
}

const isOnce = process.argv.includes('--once');
let signals = 0;
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    if (++signals > 1) process.exit(130);
    log.info(`${sig} received`);
    shutdown.abort(new Error('worker shutting down'));
  });
}

let code = 0;
try {
  code = isOnce ? await once() : (await serve(), 0);
} catch (e) {
  log.error('worker crashed', e);
  code = 1;
} finally {
  await closePool().catch(() => undefined);
}
process.exit(code);

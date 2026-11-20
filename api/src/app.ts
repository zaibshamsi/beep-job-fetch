import cors from 'cors';
import express from 'express';
import { createLogger, env } from '@beep/shared';
import { adminGuard } from './lib/auth.ts';
import { errorHandler, notFoundHandler } from './lib/errors.ts';
import { accuracyRouter } from './routes/accuracy.ts';
import { healthRouter } from './routes/health.ts';
import { jobsRouter } from './routes/jobs.ts';
import { pipelineRouter } from './routes/pipeline.ts';
import { searchRouter } from './routes/search.ts';
import { settingsRouter } from './routes/settings.ts';
import { statsRouter } from './routes/stats.ts';

const log = createLogger('api');

export interface AppOptions {
  /** Defaults to env.app.adminToken. Empty means routes are open (local use). */
  adminToken?: string;
  webOrigin?: string;
  /** Silence request logging (tests). */
  quiet?: boolean;
}

/** Build the Express app without listening, so tests can mount it on an ephemeral port. */
export function createApp(opts: AppOptions = {}) {
  const adminToken = opts.adminToken ?? env.app.adminToken;
  const app = express();
  app.disable('x-powered-by');

  app.use(cors({ origin: opts.webOrigin ?? env.app.webOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'x-admin-token'] }));
  app.use(express.json({ limit: '512kb' }));

  if (!opts.quiet) {
    app.use((req, res, next) => {
      const started = Date.now();
      // Path only: query strings and bodies can carry user text or keys, so they are never logged.
      res.on('finish', () => log.info(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`));
      next();
    });
  }

  const guard = adminGuard(adminToken);
  app.use(['/settings', '/accuracy'], guard);
  app.post('/pipeline/run', guard);

  app.use(healthRouter, jobsRouter, searchRouter, statsRouter, pipelineRouter, settingsRouter, accuracyRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

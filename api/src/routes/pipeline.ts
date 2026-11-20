import { Router } from 'express';
import { z } from 'zod';
import { errorBody, notFound } from '../lib/errors.ts';
import { getRun, listRuns, startManualRun } from '../lib/pipeline.ts';

export const pipelineRouter = Router();

const LimitSchema = z.coerce.number().int().min(1).max(100).default(20);
const IdSchema = z.coerce.number().int().positive();

pipelineRouter.get('/pipeline/runs', async (req, res) => {
  const limit = LimitSchema.parse(req.query.limit);
  res.json({ items: await listRuns(limit) });
});

pipelineRouter.get('/pipeline/runs/:id', async (req, res) => {
  const run = await getRun(IdSchema.parse(req.params.id));
  if (!run) throw notFound('Run');
  res.json(run);
});

// The worker polls for queued rows and picks this one up. Admin auth is applied in app.ts.
pipelineRouter.post('/pipeline/run', async (_req, res) => {
  const result = await startManualRun();
  if (!result.started) {
    res.status(409).json(errorBody('RUN_ACTIVE', `A pipeline run is already queued or running (run ${result.runId})`, { runId: result.runId }));
    return;
  }
  res.status(202).json({ runId: result.runId });
});

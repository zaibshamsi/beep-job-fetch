import { Router } from 'express';
import { buildStats } from '../lib/stats.ts';

export const statsRouter = Router();

statsRouter.get('/stats', async (_req, res) => {
  res.json(await buildStats());
});

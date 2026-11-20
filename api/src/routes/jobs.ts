import { Router } from 'express';
import { z } from 'zod';
import { citiesSummary, getJob, listJobs } from '../lib/jobs.ts';
import { notFound } from '../lib/errors.ts';
import { parseJobsQuery } from '../lib/filters.ts';
import { filterOptions } from '../lib/options.ts';

export const jobsRouter = Router();

const IdSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

jobsRouter.get('/jobs', async (req, res) => {
  const { filters, page, pageSize, sort } = parseJobsQuery(req.query);
  res.json(await listJobs(filters, page, pageSize, sort));
});

jobsRouter.get('/jobs/:id', async (req, res) => {
  const id = IdSchema.parse(req.params.id);
  const job = await getJob(id);
  if (!job) throw notFound('Job');
  res.json(job);
});

jobsRouter.get('/cities/summary', async (req, res) => {
  const { filters } = parseJobsQuery(req.query);
  res.json(await citiesSummary(filters));
});

jobsRouter.get('/filters/options', async (_req, res) => {
  res.json(await filterOptions());
});

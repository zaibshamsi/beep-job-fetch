import { Router } from 'express';
import { z } from 'zod';
import { parseSearchQuery } from '@beep/ai';

export const searchRouter = Router();

const BodySchema = z.object({ query: z.string().trim().min(1).max(300) });

searchRouter.post('/search/parse', async (req, res) => {
  const { query } = BodySchema.parse(req.body ?? {});
  res.json(await parseSearchQuery(query));
});

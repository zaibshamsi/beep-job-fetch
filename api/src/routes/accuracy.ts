import { Router } from 'express';
import { z } from 'zod';
import { ACCURACY_FIELDS, accuracySummary, sampleForLabelling, upsertLabels } from '../lib/accuracy.ts';

export const accuracyRouter = Router();

const SizeSchema = z.coerce.number().int().min(1).max(200).default(50);
const LabelsSchema = z.object({
  labels: z
    .array(
      z.object({
        jobId: z.number().int().positive(),
        field: z.enum(ACCURACY_FIELDS),
        predicted: z.string().max(400).nullable().optional(),
        correct: z.boolean(),
        correctValue: z.string().max(400).nullable().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

accuracyRouter.get('/accuracy/sample', async (req, res) => {
  const size = SizeSchema.parse(req.query.size);
  const items = await sampleForLabelling(size);
  res.json({ size: items.length, fields: ACCURACY_FIELDS, items });
});

accuracyRouter.put('/accuracy/labels', async (req, res) => {
  const { labels } = LabelsSchema.parse(req.body ?? {});
  res.json({ upserted: await upsertLabels(labels) });
});

accuracyRouter.get('/accuracy/summary', async (_req, res) => {
  res.json(await accuracySummary());
});

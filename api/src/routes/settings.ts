import { Router } from 'express';
import { z } from 'zod';
import { getAiStatus, removeProviderSettings, saveProviderSettings, testProvider } from '@beep/ai';

export const settingsRouter = Router();

const ProviderSchema = z.enum(['jev', 'llm']);
const text = z.string().trim().min(1).max(500);
const ProviderInputSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(500).optional(),
    model: text.optional(),
    endpoint: text.optional(),
    deployment: text.optional(),
    apiVersion: text.optional(),
  })
  .strict();

settingsRouter.get('/settings/ai', async (_req, res) => {
  res.json(await getAiStatus());
});

settingsRouter.put('/settings/ai/:provider', async (req, res) => {
  const provider = ProviderSchema.parse(req.params.provider);
  const input = ProviderInputSchema.parse(req.body ?? {});
  await saveProviderSettings(provider, input);
  res.json(await getAiStatus());
});

settingsRouter.delete('/settings/ai/:provider', async (req, res) => {
  await removeProviderSettings(ProviderSchema.parse(req.params.provider));
  res.json(await getAiStatus());
});

// Overrides are optional and never persisted; the result is the provider's own answer (ok:false carries its error text).
settingsRouter.post('/settings/ai/:provider/test', async (req, res) => {
  const provider = ProviderSchema.parse(req.params.provider);
  const overrides = ProviderInputSchema.parse(req.body ?? {});
  res.json(await testProvider(provider, overrides));
});

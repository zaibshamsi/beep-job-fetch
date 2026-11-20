/**
 * USD per 1M tokens. Copy the real numbers on the day of measurement and note the date in the working doc.
 * The LLM entry is keyed by the Azure deployment name; add it once the deployment is known.
 */
export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
  cachedInputPerM?: number;
  asOf: string;
}

export const PRICES: Record<string, ModelPrice> = {
  // Jev: input only, output free (TypeSafe AI launch post).
  'jev-latest': { inputPerM: 0.042, outputPerM: 0, asOf: '2026-11-17' },
  // Azure AI Foundry deployment, prices per 1M tokens from the Azure pricing page.
  'gpt-5.4-mini': { inputPerM: 0.9, outputPerM: 5.4, cachedInputPerM: 0.09, asOf: '2026-11-20' },
  // Fallback for an unknown model: cost shows as 0 rather than a guess.
  default_llm: { inputPerM: 0, outputPerM: 0, asOf: 'n/a' },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number {
  const p = PRICES[model] ?? PRICES.default_llm;
  const cached = p.cachedInputPerM ?? p.inputPerM;
  const freshInput = Math.max(0, inputTokens - cachedInputTokens);
  return (freshInput * p.inputPerM + cachedInputTokens * cached + outputTokens * p.outputPerM) / 1_000_000;
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ exec: vi.fn() }));
vi.mock('@beep/shared', async (orig) => ({ ...(await orig<typeof import('@beep/shared')>()), exec: h.exec }));

const { logLlmCall } = await import('./log.ts');

beforeEach(() => {
  h.exec.mockReset();
});

describe('logLlmCall', () => {
  it('writes cost from the price table (Jev: input only, output free)', async () => {
    h.exec.mockResolvedValue(1);
    await logLlmCall({ purpose: 'tag_jev', provider: 'jev', model: 'jev-latest', inputTokens: 1_000_000, outputTokens: 500, latencyMs: 80.4, success: true, runId: 5 });
    const p = h.exec.mock.calls[0]![1];
    expect(p).toMatchObject({ purpose: 'tag_jev', provider: 'jev', runId: 5, jobId: null, success: 1, latencyMs: 80, cachedTokens: 0 });
    expect(p.costUsd).toBeCloseTo(0.042);
  });

  it('truncates errors and flags failure', async () => {
    h.exec.mockResolvedValue(1);
    await logLlmCall({ purpose: 'test', provider: 'azure_openai', model: 'd', inputTokens: 0, outputTokens: 0, latencyMs: 1, success: false, error: 'x'.repeat(5000) });
    const p = h.exec.mock.calls[0]![1];
    expect(p.success).toBe(0);
    expect(p.error).toHaveLength(2000);
  });

  it('never throws when the DB is down', async () => {
    h.exec.mockImplementation(async () => {
      throw new Error('db down');
    });
    const r = await logLlmCall({ purpose: 'test', provider: 'jev', model: 'm', inputTokens: 0, outputTokens: 0, latencyMs: 1, success: true });
    expect(r).toBeUndefined();
  });
});

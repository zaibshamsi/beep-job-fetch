import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@beep/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@beep/shared')>();
  return { ...actual, query: vi.fn(), exec: vi.fn(), withTransaction: vi.fn() };
});
vi.mock('@beep/ai', () => ({
  getAiStatus: vi.fn(async () => ({ mode: 'rules_only', modeLabel: 'Rules only' })),
  saveProviderSettings: vi.fn(async () => undefined),
  removeProviderSettings: vi.fn(async () => undefined),
  testProvider: vi.fn(async () => ({ ok: true, latencyMs: 12 })),
  parseSearchQuery: vi.fn(async (q: string) => ({ filters: { q }, chips: [], parsedBy: 'rules', focusCity: null })),
}));

import { query } from '@beep/shared';
import * as ai from '@beep/ai';
import { createApp } from './app.ts';

const mockQuery = vi.mocked(query);
let server: Server;
let base = '';

async function start(opts: Parameters<typeof createApp>[0] = {}) {
  server = createApp({ quiet: true, adminToken: '', ...opts }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
const call = async (path: string, init?: RequestInit) => {
  const res = await fetch(base + path, init);
  return { status: res.status, body: (await res.json()) as any, headers: res.headers };
};
const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

beforeEach(() => {
  mockQuery.mockReset();
  vi.clearAllMocks();
});
afterEach(async () => {
  await new Promise((r) => server.close(r));
});

describe('error shapes', () => {
  beforeEach(() => start());

  it('404 for unknown routes', async () => {
    const r = await call('/nope');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No route for GET /nope' } });
  });

  it('400 VALIDATION_ERROR for bad query params', async () => {
    const r = await call('/jobs?pageSize=1000&jobType=gig');
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_ERROR');
    expect(r.body.error.message).toContain('pageSize');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('400 BAD_JSON for malformed bodies', async () => {
    const r = await call('/search/parse', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('BAD_JSON');
  });

  it('400 for an empty search query and passes a good one to the AI package', async () => {
    expect((await call('/search/parse', json('POST', { query: '  ' }))).status).toBe(400);
    const ok = await call('/search/parse', json('POST', { query: 'python internships in pune' }));
    expect(ok.status).toBe(200);
    expect(ai.parseSearchQuery).toHaveBeenCalledWith('python internships in pune');
    expect(ok.body.parsedBy).toBe('rules');
  });

  it('404 for a missing job and 400 for a non-numeric id', async () => {
    mockQuery.mockResolvedValueOnce([]);
    const missing = await call('/jobs/42');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect((await call('/jobs/abc')).status).toBe(400);
  });

  it('500 hides internals', async () => {
    mockQuery.mockRejectedValueOnce(new Error('secret table name leaked'));
    const r = await call('/pipeline/runs');
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong on the server' } });
  });

  it('rejects an unknown provider and unknown body fields', async () => {
    expect((await call('/settings/ai/openai', json('PUT', { apiKey: 'x' }))).status).toBe(400);
    expect((await call('/settings/ai/jev', json('PUT', { apiKey: 'x', extra: 1 }))).status).toBe(400);
  });
});

describe('database unreachable', () => {
  beforeEach(() => start());
  const down = () => Object.assign(new Error('Failed to connect to localhost:1433'), { name: 'ConnectionError', code: 'ESOCKET' });

  it('returns 503 with a clear message', async () => {
    mockQuery.mockRejectedValue(down());
    const r = await call('/stats');
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('DB_UNAVAILABLE');
    expect(r.body.error.message).toMatch(/unreachable/);
  });

  it('/health stays 200 and reports db:false', async () => {
    mockQuery.mockRejectedValueOnce(down());
    expect(await call('/health')).toMatchObject({ status: 200, body: { ok: true, db: false } });
    mockQuery.mockResolvedValueOnce([{ ok: 1 }]);
    expect((await call('/health')).body).toEqual({ ok: true, db: true });
  });
});

describe('admin auth gate', () => {
  describe('with a token configured', () => {
    beforeEach(() => start({ adminToken: 's3cret' }));

    it('requires x-admin-token on /settings, /accuracy and POST /pipeline/run', async () => {
      for (const [method, path] of [
        ['GET', '/settings/ai'],
        ['PUT', '/settings/ai/jev'],
        ['DELETE', '/settings/ai/jev'],
        ['POST', '/settings/ai/jev/test'],
        ['GET', '/accuracy/summary'],
        ['GET', '/accuracy/sample'],
        ['PUT', '/accuracy/labels'],
        ['POST', '/pipeline/run'],
      ] as const) {
        const r = await call(path, method === 'GET' ? undefined : json(method, {}));
        expect(r.status, `${method} ${path}`).toBe(401);
        expect(r.body.error.code).toBe('UNAUTHORIZED');
      }
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('403 for a wrong token, success for the right one', async () => {
      expect((await call('/settings/ai', { headers: { 'x-admin-token': 'nope' } })).status).toBe(403);
      expect((await call('/settings/ai', { headers: { 'x-admin-token': 's3cret' } })).status).toBe(200);
    });

    it('leaves public routes open', async () => {
      mockQuery.mockResolvedValue([]);
      expect((await call('/pipeline/runs')).status).toBe(200);
      expect((await call('/health')).status).toBe(200);
    });
  });

  it('is open when no token is configured', async () => {
    await start({ adminToken: '' });
    expect((await call('/settings/ai')).status).toBe(200);
  });
});

describe('POST /pipeline/run', () => {
  beforeEach(() => start());

  it('202 with the new run id when nothing is active', async () => {
    mockQuery.mockResolvedValueOnce([{ activeId: null, newId: 31 }]);
    const r = await call('/pipeline/run', { method: 'POST' });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ runId: 31 });
    expect(String(mockQuery.mock.calls[0]![0])).toContain("'manual', 'queued'");
  });

  it('409 RUN_ACTIVE with the active run id', async () => {
    mockQuery.mockResolvedValueOnce([{ activeId: 30, newId: null }]);
    const r = await call('/pipeline/run', { method: 'POST' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('RUN_ACTIVE');
    expect(r.body.runId).toBe(30);
  });
});

describe('settings', () => {
  beforeEach(() => start());

  it('saves, removes and tests through @beep/ai, returning status without keys', async () => {
    const put = await call('/settings/ai/llm', json('PUT', { apiKey: 'sk-secret', deployment: 'gpt' }));
    expect(put.status).toBe(200);
    expect(ai.saveProviderSettings).toHaveBeenCalledWith('llm', { apiKey: 'sk-secret', deployment: 'gpt' });
    expect(JSON.stringify(put.body)).not.toContain('sk-secret');

    expect((await call('/settings/ai/jev', { method: 'DELETE' })).status).toBe(200);
    expect(ai.removeProviderSettings).toHaveBeenCalledWith('jev');

    const test = await call('/settings/ai/jev/test', { method: 'POST' });
    expect(test.body).toEqual({ ok: true, latencyMs: 12 });
    expect(ai.testProvider).toHaveBeenCalledWith('jev', {});
  });
});

describe('CORS', () => {
  it('sends the allow-origin header for the configured web origin only', async () => {
    await start({ webOrigin: 'http://localhost:5173' });
    mockQuery.mockResolvedValue([{ ok: 1 }]);
    const ok = await call('/health', { headers: { origin: 'http://localhost:5173' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    // The cors package answers every origin with the single allowed one; the browser then blocks a mismatch.
    const other = await call('/health', { headers: { origin: 'http://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});

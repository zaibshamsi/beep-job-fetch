import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ query: vi.fn(), exec: vi.fn() }));
vi.mock('@beep/shared', async (orig) => ({ ...(await orig<typeof import('@beep/shared')>()), query: h.query, exec: h.exec }));

const { queryHash, readCache, writeCache } = await import('./cache.ts');

beforeEach(() => {
  h.query.mockReset();
  h.exec.mockReset();
});

describe('search cache', () => {
  it('hashes the normalised query so case and spacing do not matter', () => {
    expect(queryHash('  Python   Internships IN Pune ')).toBe(queryHash('python internships in pune'));
    expect(queryHash('a')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('counts a hit and returns the stored filters', async () => {
    h.query.mockResolvedValue([{ filters: JSON.stringify({ filters: { cities: ['Pune'] }, parsedBy: 'llm' }) }]);
    h.exec.mockResolvedValue(1);
    expect(await readCache('pune')).toEqual({ filters: { cities: ['Pune'] }, parsedBy: 'llm' });
    expect(h.exec.mock.calls[0]![0]).toMatch(/hits = hits \+ 1/);
  });

  it('treats a miss, a corrupt row and a DB error as no cache', async () => {
    h.query.mockResolvedValueOnce([]);
    expect(await readCache('q')).toBeNull();
    h.query.mockResolvedValueOnce([{ filters: '{"filters":{"jobType":"nonsense"},"parsedBy":"llm"}' }]);
    expect(await readCache('q')).toBeNull();
    h.query.mockImplementationOnce(async () => {
      throw new Error('db down');
    });
    expect(await readCache('q')).toBeNull();
  });

  it('upserts filters with the parsing layer and never throws', async () => {
    h.exec.mockResolvedValue(1);
    await writeCache('Pune Jobs', { cities: ['Pune'] }, 'rules');
    const p = h.exec.mock.calls[0]![1];
    expect(p.text).toBe('pune jobs');
    expect(JSON.parse(p.filters)).toEqual({ filters: { cities: ['Pune'] }, parsedBy: 'rules' });
    h.exec.mockImplementation(async () => {
      throw new Error('db down');
    });
    await expect(writeCache('x', {}, 'rules')).resolves.toBeUndefined();
  });
});

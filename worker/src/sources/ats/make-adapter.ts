import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createLogger, JobPostSchema, politeFetch } from '@beep/shared';
import type { JobPost, RawPost, RunContext, SourceAdapter } from '@beep/shared';
import { isIndiaCode, isIndiaLocation, isSeniorTitle } from './india.ts';
import type { AtsPayload, Company, Platform, PlatformDef, Posting } from './types.ts';

const log = createLogger('ats');

export function loadCompanies(platform?: Platform): Company[] {
  const file = fileURLToPath(new URL('./companies.json', import.meta.url));
  const all = JSON.parse(readFileSync(file, 'utf8')) as Company[];
  return platform ? all.filter((c) => c.platform === platform) : all;
}

/**
 * The India-located locations of a posting, or [] if it is not an India job.
 * A platform country code is authoritative for the primary location; remote roles count only
 * when a location string itself says India or APAC.
 */
export function indiaLocations(p: Posting): string[] {
  const hits = p.locations.filter(isIndiaLocation);
  if (hits.length) return hits;
  if (isIndiaCode(p.country) === true) return p.locations.length ? [p.locations[0]!] : ['India'];
  return [];
}

/** Parse one platform job and apply the India and not-clearly-senior rules. Null means drop. */
export function toPosting(def: PlatformDef, job: unknown, company: { slug: string; name: string }): Posting | null {
  const p = def.parse(job, company);
  if (!p || isSeniorTitle(p.title)) return null;
  return indiaLocations(p).length ? p : null;
}

export function normalizeAts(def: PlatformDef, raw: RawPost): JobPost | null {
  const { company, job } = raw.payload as AtsPayload;
  if (!company?.slug) return null;
  const p = toPosting(def, job, company);
  if (!p) return null;
  const parsed = JobPostSchema.safeParse({
    source: def.platform,
    sourceJobId: `${company.slug}:${p.id}`,
    title: p.title,
    company: company.name,
    locationRaw: indiaLocations(p).join('; ').slice(0, 500),
    description: p.description,
    applyUrl: p.applyUrl,
    postedAt: p.postedAt && !Number.isNaN(p.postedAt.getTime()) ? p.postedAt : null,
    employmentTypeRaw: p.employmentType,
    compensationRaw: p.compensation,
    sourceHint: 'none',
  });
  return parsed.success ? parsed.data : null;
}

/** Fetches one board; returns null (after logging) if the board is unusable. */
export async function fetchBoard(
  def: PlatformDef,
  slug: string,
  full: boolean,
  signal?: AbortSignal,
): Promise<{ jobs: unknown[]; json: unknown } | null> {
  try {
    const res = await politeFetch(def.boardUrl(slug, full), { signal, timeoutMs: 45_000, minDelayMs: def.minDelayMs });
    if (!res.ok) {
      log.warn(`${def.platform}/${slug}: HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const jobs = def.jobsOf(json);
    if (!jobs) {
      log.warn(`${def.platform}/${slug}: unexpected response shape`);
      return null;
    }
    return { jobs, json };
  } catch (err) {
    if (signal?.aborted) throw err;
    log.warn(`${def.platform}/${slug}: ${(err as Error).message}`);
    return null;
  }
}

export function createAtsAdapter(def: PlatformDef, companies: Company[] = loadCompanies(def.platform)): SourceAdapter {
  return {
    name: def.platform,
    description: def.description,
    meta: def.meta,
    unavailableReason: () => (companies.length ? null : 'no companies configured in ats/companies.json'),
    async fetch(ctx: RunContext): Promise<RawPost[]> {
      const out: RawPost[] = [];
      // Start at a different board each run so a small cap does not always favour the same companies.
      const start = companies.length ? ctx.runId % companies.length : 0;
      const ordered = [...companies.slice(start), ...companies.slice(0, start)];
      let boards = 0;
      let seen = 0;
      for (const c of ordered) {
        if (ctx.signal?.aborted || out.length >= ctx.maxPostsPerSource) break;
        const board = await fetchBoard(def, c.slug, true, ctx.signal);
        if (!board) continue;
        boards++;
        seen += board.jobs.length;
        for (const job of board.jobs) {
          const p = toPosting(def, job, c);
          if (!p) continue;
          const payload: AtsPayload = { company: { slug: c.slug, name: c.name }, job };
          out.push({ source: def.platform, sourceJobId: `${c.slug}:${p.id}`, payload });
          if (out.length >= ctx.maxPostsPerSource) break;
        }
      }
      ctx.log.info(`${def.platform}: ${boards}/${companies.length} boards, ${seen} postings seen, ${out.length} India kept`);
      return out;
    },
    normalize: (raw) => normalizeAts(def, raw),
  };
}

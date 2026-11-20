import { ruleTag } from '@beep/ai';
import type { FresherVerdict } from '@beep/ai';
import { normalizeCompany, normalizeTitle, sha256, trigramSimilarity, urlHash, type JobPost } from '@beep/shared';
import type { Candidate, SourceLink } from './types.ts';
import { sourceKey } from './util.ts';

export const FUZZY_THRESHOLD = 0.85;

/** Same text the tag cache keys on: title, company, location and description. */
export const contentHashOf = (p: JobPost) => sha256([p.title, p.company, p.locationRaw, p.description].join('\n'));

export function makeCandidate(
  post: JobPost,
  verdict: FresherVerdict,
  citiesOf: (p: JobPost) => string[] = (p) => ruleTag(p).cities,
): Candidate {
  let cities: string[] = [];
  try {
    cities = citiesOf(post);
  } catch {
    // rules are advisory here; fuzzy matching falls back to the location text
  }
  return {
    post,
    verdict,
    urlHash: urlHash(post.applyUrl),
    companyNorm: normalizeCompany(post.company),
    titleNorm: normalizeTitle(post.title),
    cities,
    contentHash: contentHashOf(post),
    links: [{ source: post.source, sourceJobId: post.sourceJobId, applyUrl: post.applyUrl }],
  };
}

// ---------- pure matching ----------

export interface Matchable {
  companyNorm: string;
  titleNorm: string;
  locationRaw: string;
  cities: string[];
}

const normLoc = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function locationsOverlap(a: Pick<Matchable, 'cities' | 'locationRaw'>, b: Pick<Matchable, 'cities' | 'locationRaw'>): boolean {
  if (a.cities.some((c) => b.cities.includes(c))) return true;
  const la = normLoc(a.locationRaw);
  return la !== '' && la === normLoc(b.locationRaw);
}

export function isFuzzyDuplicate(a: Matchable, b: Matchable): boolean {
  return (
    a.companyNorm !== '' &&
    a.companyNorm === b.companyNorm &&
    locationsOverlap(a, b) &&
    trigramSimilarity(a.titleNorm, b.titleNorm) >= FUZZY_THRESHOLD
  );
}

const matchable = (c: Candidate): Matchable => ({
  companyNorm: c.companyNorm,
  titleNorm: c.titleNorm,
  locationRaw: c.post.locationRaw,
  cities: c.cities,
});

/** Folds `other` into `base`: union of source links, richer description wins. */
export function mergeInto(base: Candidate, other: Candidate): void {
  for (const l of other.links) {
    if (!base.links.some((x) => x.source === l.source && x.sourceJobId === l.sourceJobId)) base.links.push(l);
  }
  if (other.post.description.length > base.post.description.length) {
    base.post = { ...base.post, description: other.post.description };
  }
}

/** Collapses posts that share a url_hash or a (source, sourceJobId). Returns survivors and the number merged. */
export function collapseExact(cands: Candidate[]): { unique: Candidate[]; merged: number } {
  const byKey = new Map<string, Candidate>();
  const unique: Candidate[] = [];
  let merged = 0;
  for (const c of cands) {
    const k1 = `u:${c.urlHash}`;
    const k2 = `s:${sourceKey(c.post.source, c.post.sourceJobId)}`;
    const hit = byKey.get(k1) ?? byKey.get(k2);
    if (hit) {
      mergeInto(hit, c);
      byKey.set(k1, hit);
      byKey.set(k2, hit);
      merged++;
      continue;
    }
    byKey.set(k1, c);
    byKey.set(k2, c);
    unique.push(c);
  }
  return { unique, merged };
}

/** Collapses near-identical posts inside one batch (same company, location and a similar title). */
export function collapseFuzzy(cands: Candidate[]): { unique: Candidate[]; merged: number } {
  const byCompany = new Map<string, Candidate[]>();
  const unique: Candidate[] = [];
  let merged = 0;
  for (const c of cands) {
    const peers = byCompany.get(c.companyNorm) ?? [];
    const hit = peers.find((p) => isFuzzyDuplicate(matchable(p), matchable(c)));
    if (hit) {
      mergeInto(hit, c);
      merged++;
      continue;
    }
    peers.push(c);
    byCompany.set(c.companyNorm, peers);
    unique.push(c);
  }
  return { unique, merged };
}

// ---------- stage (talks to the DB through a small repo interface) ----------

export interface ExistingJob {
  id: number;
  primarySource: string;
  contentHash: string | null;
  /** For source-key matches: whether that listing is the job's primary (first) one, the only one that owns its content. */
  isPrimaryLink?: boolean;
}

export interface PoolJob {
  id: number;
  companyNorm: string;
  titleNorm: string;
  locationRaw: string;
  cities: string[];
  descriptionLength: number;
}

export interface DedupeRepo {
  /** Keys are sourceKey(source, sourceJobId). */
  findBySourceKeys(keys: SourceLinkKey[]): Promise<Map<string, ExistingJob>>;
  findByUrlHashes(hashes: string[]): Promise<Map<string, ExistingJob>>;
  /** Active jobs for these normalized company names, grouped by company. */
  loadFuzzyPool(companyNorms: string[]): Promise<Map<string, PoolJob[]>>;
}
export type SourceLinkKey = Pick<SourceLink, 'source' | 'sourceJobId'>;

/** Known job that this run saw again, plus the links to record on it. */
export interface Touch {
  jobId: number;
  links: SourceLink[];
  /** Set when a merged duplicate carries a longer description than the stored one. */
  description?: string;
  /** Set when the job's own source changed its content: re-enrich and update the row. */
  refresh?: Candidate;
}

export interface DedupeResult {
  fresh: Candidate[];
  touches: Touch[];
  duplicatesExact: number;
  duplicatesFuzzy: number;
}

export async function dedupeStage(cands: Candidate[], repo: DedupeRepo): Promise<DedupeResult> {
  let duplicatesExact = 0;
  let duplicatesFuzzy = 0;
  const touches = new Map<number, Touch>();
  const touchOf = (id: number) => {
    let t = touches.get(id);
    if (!t) touches.set(id, (t = { jobId: id, links: [] }));
    return t;
  };

  // 1. inside the batch
  const exact = collapseExact(cands);
  duplicatesExact += exact.merged;

  // 2. against known jobs: same listing again, or same apply URL from elsewhere
  const bySource = await repo.findBySourceKeys(exact.unique.map((c) => c.post));
  const byHash = await repo.findByUrlHashes(exact.unique.map((c) => c.urlHash));
  const unmatched: Candidate[] = [];
  for (const c of exact.unique) {
    const seenAgain = bySource.get(sourceKey(c.post.source, c.post.sourceJobId));
    const existing = seenAgain ?? byHash.get(c.urlHash);
    if (!existing) {
      unmatched.push(c);
      continue;
    }
    if (!seenAgain) duplicatesExact++;
    const t = touchOf(existing.id);
    t.links.push(...c.links);
    const ownsContent = seenAgain ? seenAgain.isPrimaryLink === true : existing.primarySource === c.post.source;
    const ownContentChanged = ownsContent && existing.contentHash !== c.contentHash;
    if (ownContentChanged) t.refresh = c;
  }

  // 3. against active jobs by company + location + title similarity
  const pool = await repo.loadFuzzyPool([...new Set(unmatched.map((c) => c.companyNorm))]);
  const stillNew: Candidate[] = [];
  for (const c of unmatched) {
    const hit = (pool.get(c.companyNorm) ?? []).find((j) => isFuzzyDuplicate(matchable(c), j));
    if (!hit) {
      stillNew.push(c);
      continue;
    }
    duplicatesFuzzy++;
    const t = touchOf(hit.id);
    t.links.push(...c.links);
    if (c.post.description.length > Math.max(hit.descriptionLength, t.description?.length ?? 0)) {
      t.description = c.post.description;
    }
  }

  // 4. what is left may still repeat itself
  const fuzzy = collapseFuzzy(stillNew);
  duplicatesFuzzy += fuzzy.merged;

  return { fresh: fuzzy.unique, touches: [...touches.values()], duplicatesExact, duplicatesFuzzy };
}

import { JobPostSchema, truncate, type JobPost, type RawPost, type SourceAdapter } from '@beep/shared';
import { errMsg } from './util.ts';

export const MAX_DESCRIPTION_CHARS = 12_000;

export interface NormalizeResult {
  posts: JobPost[];
  rejected: number;
  /** A few reasons, for the run log and stats. */
  reasons: string[];
}

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

function zodSummary(e: { issues: { path: unknown[]; message: string }[] }): string {
  return e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
}

export function normalizeRaw(
  adapter: Pick<SourceAdapter, 'name' | 'normalize'>,
  raws: RawPost[],
  maxReasons = 5,
): NormalizeResult {
  const posts: JobPost[] = [];
  const reasons: string[] = [];
  let rejected = 0;
  const reject = (id: string, why: string) => {
    rejected++;
    if (reasons.length < maxReasons) reasons.push(`${adapter.name}/${id}: ${why}`);
  };

  for (const raw of raws) {
    const id = String(raw.sourceJobId);
    try {
      const out = adapter.normalize(raw);
      if (!out) {
        reject(id, 'adapter returned null (filtered out)');
        continue;
      }
      posts.push(
        JobPostSchema.parse({
          ...out,
          source: adapter.name,
          title: collapse(out.title ?? ''),
          company: collapse(out.company ?? ''),
          locationRaw: collapse(out.locationRaw ?? ''),
          description: truncate((out.description ?? '').trim(), MAX_DESCRIPTION_CHARS),
        }),
      );
    } catch (e) {
      reject(id, e instanceof Error && 'issues' in e ? zodSummary(e as never) : errMsg(e));
    }
  }
  return { posts, rejected, reasons };
}

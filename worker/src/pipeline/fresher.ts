import { fresherCheck } from '@beep/ai';
import type { FresherVerdict } from '@beep/ai';
import type { JobPost } from '@beep/shared';

export type FresherCheck = (post: JobPost) => { verdict: FresherVerdict; reason: string };

export interface FresherResult {
  kept: { post: JobPost; verdict: FresherVerdict }[];
  /** Posts whose rules verdict was 'no'. */
  dropped: number;
}

/** 'no' is dropped; 'yes' and 'unknown' go on (the enrichment graph makes the final call on 'unknown'). */
export function fresherFilter(posts: JobPost[], check: FresherCheck = fresherCheck): FresherResult {
  const kept: FresherResult['kept'] = [];
  let dropped = 0;
  for (const post of posts) {
    let verdict: FresherVerdict;
    try {
      verdict = check(post).verdict;
    } catch {
      verdict = 'unknown';
    }
    if (verdict === 'no') dropped++;
    else kept.push({ post, verdict });
  }
  return { kept, dropped };
}

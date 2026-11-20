import type { SourceMeta } from '@beep/shared';

export type Platform = 'greenhouse' | 'lever' | 'ashby' | 'workable';

export interface Company {
  platform: Platform;
  slug: string;
  name: string;
}

/** Stored verbatim in raw_posts: the platform's own job object plus the board it came from. */
export interface AtsPayload {
  company: { slug: string; name: string };
  job: unknown;
}

/** What each platform reports about one job, before we decide whether to keep it. */
export interface Posting {
  /** Platform job id (unprefixed). */
  id: string;
  title: string;
  /** Every location string the posting lists (primary first). */
  locations: string[];
  /** ISO country code or country name when the platform gives one for the primary location. */
  country: string | null;
  applyUrl: string;
  description: string;
  postedAt: Date | null;
  employmentType: string | null;
  compensation: string | null;
  /** True when the platform flags the role as remote (used with locations, never alone). */
  remote: boolean;
}

export interface PlatformDef {
  platform: Platform;
  description: string;
  meta: SourceMeta;
  /** Minimum ms between requests to the platform host; default 1000. */
  minDelayMs?: number;
  /** `full` asks for descriptions (bigger payload); listing-only is enough to count India openings. */
  boardUrl(slug: string, full: boolean): string;
  /** Pulls the job array out of the board response; null if the shape is not a board. */
  jobsOf(json: unknown): unknown[] | null;
  /** Board display name if the response carries one. */
  boardName?(json: unknown): string | null;
  parse(job: unknown, company: { slug: string; name: string }): Posting | null;
}

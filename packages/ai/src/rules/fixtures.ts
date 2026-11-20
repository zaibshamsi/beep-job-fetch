import type { JobPost } from '@beep/shared';

/** Test helper: a valid JobPost with only the interesting fields overridden. */
export function post(over: Partial<JobPost> = {}): JobPost {
  return {
    source: 'test',
    sourceJobId: '1',
    title: 'Software Engineer',
    company: 'Acme',
    locationRaw: '',
    description: '',
    applyUrl: 'https://example.com/job/1',
    postedAt: null,
    employmentTypeRaw: null,
    compensationRaw: null,
    sourceHint: 'none',
    ...over,
  };
}

import type { JobPost, RawPost, SourceAdapter, SourceMeta } from '@beep/shared';

export const okMeta: SourceMeta = {
  homepage: 'https://fake.example',
  accessMethod: 'feed',
  termsUrl: null,
  termsStatus: 'allowed',
  termsNotes: 'test fixture',
};

export interface FakeAdapterOptions {
  name?: string;
  meta?: Partial<SourceMeta>;
  unavailable?: string | null;
  raws?: RawPost[] | (() => Promise<RawPost[]>);
  normalize?: (raw: RawPost) => JobPost | null;
}

/** In-memory adapter whose raw payload is already a JobPost-shaped object. */
export function fakeAdapter(o: FakeAdapterOptions = {}): SourceAdapter {
  const name = o.name ?? 'fake';
  return {
    name,
    description: `fake source ${name}`,
    meta: { ...okMeta, ...o.meta },
    unavailableReason: () => o.unavailable ?? null,
    fetch: async () => (typeof o.raws === 'function' ? o.raws() : (o.raws ?? [])),
    normalize: o.normalize ?? ((raw) => raw.payload as JobPost),
  };
}

export function rawOf(post: Partial<JobPost> & { sourceJobId: string }, source = 'fake'): RawPost {
  return { source, sourceJobId: post.sourceJobId, payload: makePost({ ...post, source }) };
}

export function makePost(p: Partial<JobPost> = {}): JobPost {
  return {
    source: 'fake',
    sourceJobId: '1',
    title: 'Software Engineer Intern',
    company: 'Acme Technologies Pvt Ltd',
    locationRaw: 'Pune, Maharashtra',
    description: 'Build things.',
    applyUrl: `https://fake.example/jobs/${p.sourceJobId ?? '1'}`,
    postedAt: null,
    employmentTypeRaw: null,
    compensationRaw: null,
    sourceHint: 'none',
    ...p,
  };
}

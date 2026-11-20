import { createJsonLdAdapter } from './careers/jsonld.ts';

// Employer career sites read through sitemap/feed discovery + schema.org JobPosting JSON-LD.
// The employer list and per-site settings live in ./careers/sites.json; evidence in docs/CAREERS_REVIEW.md.
export default [createJsonLdAdapter()];

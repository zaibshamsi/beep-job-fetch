import { ashby } from './ats/ashby.ts';
import { greenhouse } from './ats/greenhouse.ts';
import { lever } from './ats/lever.ts';
import { createAtsAdapter } from './ats/make-adapter.ts';
import { workable } from './ats/workable.ts';

/**
 * Public company job-board APIs, one adapter per platform, boards listed in ats/companies.json.
 * Deliberately not built (checked 2026-11-18):
 * - SmartRecruiters: robots.txt on api.smartrecruiters.com disallows every agent except LinkedInBot, and the docs require an API key.
 * - Recruitee: the Careers Site API docs require a token on /offers.
 * - Zoho Recruit: no documented public jobs endpoint, only OAuth APIs.
 */
export default [greenhouse, lever, ashby, workable].map((def) => createAtsAdapter(def));

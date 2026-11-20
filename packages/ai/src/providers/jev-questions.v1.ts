/**
 * Versioned Jev question definitions. Change wording => bump JEV_PROMPT_VERSION and copy the old file's text
 * to the working doc so accuracy can be compared per version.
 */
import { choice, noul } from '@typesafe-ai/sdk';
import { JOB_TYPES, ROLE_CATEGORIES, WORK_MODES, truncate } from '@beep/shared';
import type { JobPost, RoleCategory } from '@beep/shared';

export const JEV_PROMPT_VERSION = 'jev.v1';

export const ROLE_DESCRIPTIONS: Record<RoleCategory, string> = {
  'Software Engineering': 'Writing application code: software/backend/frontend/full-stack/mobile developer, SDE, programmer, embedded software.',
  'Data / AI / ML': 'Data science, machine learning, AI/LLM engineering, data engineering, computer vision, NLP, research scientist.',
  'QA / Testing': 'Software quality: manual or automation testing, SDET, test engineer, quality assurance.',
  'DevOps / Cloud': 'Infrastructure and delivery: DevOps, SRE, cloud engineer, platform, systems/network administrator, build and release.',
  Cybersecurity: 'Information security: security analyst, SOC, pentesting, GRC, application security.',
  'UI / UX Design': 'Designing interfaces and experiences: UI/UX/product designer, visual or graphic design for apps, design research.',
  'Product Management': 'Owning a product roadmap: product manager, associate product manager, product owner, product analyst intern.',
  'Business / Data Analyst': 'Analysing data and business numbers for decisions: business analyst, data analyst, BI, reporting, MIS, research analyst.',
  'Sales / Business Development': 'Selling and growing revenue: sales executive, business development, inside sales, account executive, lead generation.',
  Marketing: 'Promoting a brand: digital marketing, SEO, social media, performance marketing, growth, brand, PR.',
  'Content / Writing': 'Producing written or media content: content writer, copywriter, technical writer, editor, video or podcast content.',
  'Finance / Accounting': 'Money work: accounting, audit, taxation, financial analyst, banking, investment, treasury, CA articleship.',
  'HR / Recruiting': 'People operations: HR, talent acquisition, recruiter, payroll, employee engagement.',
  'Operations / Supply Chain': 'Running business processes: operations, logistics, procurement, supply chain, admin, project coordination.',
  'Customer Support': 'Helping customers: customer support/success, call centre, technical support, chat or email support, voice process.',
  'Core Engineering': 'Non-software engineering: mechanical, civil, electrical, electronics, chemical, production, manufacturing, site engineer.',
  Consulting: 'Advisory and strategy: management or technology consulting, strategy analyst, SAP/ERP functional consultant.',
  Other: 'Anything that fits none of the categories above (teaching, legal, healthcare, design of physical goods, general trainee, etc.).',
};

const JOB_TYPE_DESCRIPTIONS: Record<(typeof JOB_TYPES)[number], string> = {
  internship: 'A fixed-term internship or training position for students or recent graduates, often with a stipend.',
  full_time: 'A permanent salaried job, including graduate or trainee programmes that lead to a full-time role.',
  apprenticeship: 'A formal apprenticeship or apprentice programme (for example under the Apprentices Act).',
  contract: 'A fixed-term contract, freelance, part-time or temporary engagement that is not an internship.',
};

const WORK_MODE_DESCRIPTIONS: Record<(typeof WORK_MODES)[number], string> = {
  onsite: 'The person works from the employer office or site every working day; also the default when nothing is said.',
  hybrid: 'A mix of office days and remote days.',
  remote: 'Fully remote, work from home or work from anywhere.',
};

/** Slug used as the Choice label so odd characters (" / ") never reach the API. */
export const roleSlug = (r: string) => r.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const SLUG_TO_ROLE = new Map<string, RoleCategory>(ROLE_CATEGORIES.map((r) => [roleSlug(r), r]));
export const roleFromSlug = (slug: string): RoleCategory | null => SLUG_TO_ROLE.get(slug) ?? null;

export const JEV_FRESHER_STATEMENT =
  'The role is aimed at students or recent graduates with 0 to 1 years of experience (internship, trainee, graduate programme, entry level, or fresher hiring).';

export function buildJevQuestions(opts: { candidateCities?: string[] } = {}) {
  const roleCriteria = Object.fromEntries(
    ROLE_CATEGORIES.map((r) => [roleSlug(r), `${r}. ${ROLE_DESCRIPTIONS[r]}`]),
  ) as Record<string, string>;

  const base = {
    role: choice('Which role category best describes the job described in the post?', roleCriteria),
    jobType: choice('What kind of engagement is this?', JOB_TYPE_DESCRIPTIONS),
    workMode: choice('Where does the person work?', WORK_MODE_DESCRIPTIONS),
    isFresher: noul(JEV_FRESHER_STATEMENT),
  };
  const cities = opts.candidateCities?.filter(Boolean) ?? [];
  if (cities.length < 2) return base;
  return {
    ...base,
    city: choice(
      'Which of these cities is the primary place of work for this post?',
      Object.fromEntries(cities.map((c) => [c, null])) as Record<string, null>,
    ),
  };
}

/** The post text Jev reads. Capped so cost stays predictable (~1,500 description characters). */
export function buildJevState(post: JobPost): string {
  const lines = [
    `Title: ${post.title}`,
    `Company: ${post.company}`,
    post.locationRaw && `Location: ${post.locationRaw}`,
    post.employmentTypeRaw && `Employment type: ${post.employmentTypeRaw}`,
    post.compensationRaw && `Compensation: ${post.compensationRaw}`,
    post.description && `Description: ${truncate(post.description, 1500)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

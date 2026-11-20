/** Closed list of role categories used for tagging and filtering. */
export const ROLE_CATEGORIES = [
  'Software Engineering',
  'Data / AI / ML',
  'QA / Testing',
  'DevOps / Cloud',
  'Cybersecurity',
  'UI / UX Design',
  'Product Management',
  'Business / Data Analyst',
  'Sales / Business Development',
  'Marketing',
  'Content / Writing',
  'Finance / Accounting',
  'HR / Recruiting',
  'Operations / Supply Chain',
  'Customer Support',
  'Core Engineering',
  'Consulting',
  'Other',
] as const;
export type RoleCategory = (typeof ROLE_CATEGORIES)[number];

export const JOB_TYPES = ['internship', 'full_time', 'apprenticeship', 'contract'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

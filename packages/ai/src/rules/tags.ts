import type { JobType, WorkMode } from '@beep/shared';

const NEG = String.raw`(?<!\b(?:no|not)\s(?:a\s|an\s)?)`;
/** Bare "remote" is trusted in short structured fields, not in prose ("collaborate with remote teams"). */
const FIELD_REMOTE = new RegExp(`${NEG}\\b(?:remote|work from home|wfh|work from anywhere)\\b`, 'i');
const FIELD_ONSITE = /\bon[- ]?site\b|\bin[- ]office\b|\bwork from office\b|\bwfo\b|\bin[- ]person\b/i;
const HYBRID = /\bhybrid\b/i;
const PROSE_REMOTE = new RegExp(
  `${NEG}\\b(?:work from home|wfh|work from anywhere|fully remote|100% remote|remote (?:job|position|role|internship|opportunity|work)|this (?:is a )?remote)\\b`,
  'i',
);
const PROSE_ONSITE = new RegExp(`${NEG}\\b(?:on[- ]?site (?:role|position|internship|job)|work from office|in[- ]office|wfo|office[- ]based)\\b`, 'i');

/** Work mode from title / location / employment type first, then from the description. */
export function workModeHint(fields: string, description: string): WorkMode | null {
  if (HYBRID.test(fields)) return 'hybrid';
  const remote = FIELD_REMOTE.test(fields);
  const onsite = FIELD_ONSITE.test(fields);
  if (remote !== onsite) return remote ? 'remote' : 'onsite';
  if (remote && onsite) return 'hybrid';

  const d = description.slice(0, 3000);
  if (HYBRID.test(d)) return 'hybrid';
  const dr = PROSE_REMOTE.test(d);
  const dn = PROSE_ONSITE.test(d);
  if (dr && !dn) return 'remote';
  if (dn && !dr) return 'onsite';
  return null;
}

/** Job type from title and employment type. A trainee title is weak: it is full time unless the source says internship. */
export function jobTypeHint(title: string, employmentTypeRaw: string | null, sourceHint: string): JobType | null {
  const t = `${title} ${(employmentTypeRaw ?? '').replace(/_/g, ' ')}`;
  if (/\bapprentice(?:ship)?s?\b/i.test(t)) return 'apprenticeship';
  if (/\binterns?\b|\binternships?\b/i.test(t)) return 'internship';
  if (/\bcontract(?:ual|or)?\b|\bfreelance\b|\btemporary\b|\bconsultant basis\b|\bthird[- ]party payroll\b/i.test(t)) return 'contract';
  if (/\bfull[- ]?time\b|\bpermanent\b/i.test(t)) return 'full_time';
  if (sourceHint === 'internship') return 'internship';
  if (/\btrainee\b|\bgraduate\b/i.test(t)) return 'full_time';
  return null;
}

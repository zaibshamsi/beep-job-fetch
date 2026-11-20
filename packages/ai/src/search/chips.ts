import { REMOTE } from '@beep/shared';
import type { JobFilters } from '@beep/shared';
import type { SearchChip } from '../contracts.ts';

const JOB_TYPE_LABEL = { internship: 'Internship', full_time: 'Full time', apprenticeship: 'Apprenticeship', contract: 'Contract' } as const;
const WORK_MODE_LABEL = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' } as const;

function postedLabel(days: number): string {
  if (days <= 1) return 'Posted today';
  if (days === 7) return 'Posted this week';
  if (days === 30) return 'Posted in last 30 days';
  return `Posted in last ${days} days`;
}

/** One removable chip per applied filter, with a label a person can read. */
export function buildChips(f: JobFilters): SearchChip[] {
  const chips: SearchChip[] = [];
  for (const k of f.keywords ?? []) chips.push({ field: 'keyword', label: k, value: k });
  for (const c of f.cities ?? []) chips.push({ field: 'cities', label: c, value: c });
  if (f.roleCategory) chips.push({ field: 'roleCategory', label: f.roleCategory, value: f.roleCategory });
  if (f.jobType) chips.push({ field: 'jobType', label: JOB_TYPE_LABEL[f.jobType], value: f.jobType });
  if (f.workMode) chips.push({ field: 'workMode', label: WORK_MODE_LABEL[f.workMode], value: f.workMode });
  if (f.stipendMin != null) {
    const label = f.stipendMin <= 1 ? 'With stipend' : `Stipend from ₹${f.stipendMin.toLocaleString('en-IN')}/month`;
    chips.push({ field: 'stipendMin', label, value: f.stipendMin });
  }
  if (f.postedWithinDays != null) chips.push({ field: 'postedWithinDays', label: postedLabel(f.postedWithinDays), value: f.postedWithinDays });
  if (f.source) chips.push({ field: 'source', label: `Source: ${f.source}`, value: f.source });
  if (f.isNew) chips.push({ field: 'isNew', label: 'New today', value: true });
  return chips;
}

/** The map flies to the first real city; "Remote" has no place on the map. */
export function focusCityOf(f: JobFilters): string | null {
  return f.cities?.find((c) => c !== REMOTE) ?? null;
}

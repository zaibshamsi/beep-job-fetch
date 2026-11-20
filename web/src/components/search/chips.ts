import { JOB_TYPE_LABEL, WORK_MODE_LABEL } from '../../api/types.ts';
import type { UrlFilters } from '../../state/filters.ts';
import { formatNumber } from '../jobs/format.ts';
import { sourceName } from '../jobs/sources.ts';

export interface FilterChip {
  /** Stable key, also the React key: "city:Pune", "jobType". */
  key: string;
  /** Which filter it is, for grouping and counts. */
  field: keyof UrlFilters;
  label: string;
  /** The filters with this one removed. */
  remove: (f: UrlFilters) => UrlFilters;
}

export function postedLabel(days: number): string {
  if (days === 1) return 'Last 24 hours';
  return `Last ${formatNumber(days)} days`;
}

export function stipendLabel(min: number): string {
  return min <= 1 ? 'Paid only' : `₹${formatNumber(min)}+/month`;
}

/** One chip per active filter in the CURRENT URL filters (so manual changes stay visible). */
export function buildChips(f: UrlFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (f.q) chips.push({ key: 'q', field: 'q', label: `“${f.q}”`, remove: (x) => ({ ...x, q: undefined }) });
  if (f.role) chips.push({ key: 'role', field: 'role', label: f.role, remove: (x) => ({ ...x, role: undefined }) });
  for (const city of f.cities) {
    chips.push({
      key: `city:${city}`,
      field: 'cities',
      label: city,
      remove: (x) => ({ ...x, cities: x.cities.filter((c) => c !== city) }),
    });
  }
  if (f.jobType) {
    chips.push({
      key: 'jobType',
      field: 'jobType',
      label: JOB_TYPE_LABEL[f.jobType] ?? f.jobType,
      remove: (x) => ({ ...x, jobType: undefined }),
    });
  }
  if (f.workMode) {
    chips.push({
      key: 'workMode',
      field: 'workMode',
      label: WORK_MODE_LABEL[f.workMode] ?? f.workMode,
      remove: (x) => ({ ...x, workMode: undefined }),
    });
  }
  if (f.stipendMin != null && f.stipendMin > 0) {
    chips.push({
      key: 'stipendMin',
      field: 'stipendMin',
      label: stipendLabel(f.stipendMin),
      remove: (x) => ({ ...x, stipendMin: undefined }),
    });
  }
  if (f.postedWithinDays != null && f.postedWithinDays > 0) {
    chips.push({
      key: 'postedWithinDays',
      field: 'postedWithinDays',
      label: postedLabel(f.postedWithinDays),
      remove: (x) => ({ ...x, postedWithinDays: undefined }),
    });
  }
  if (f.source) {
    chips.push({ key: 'source', field: 'source', label: sourceName(f.source), remove: (x) => ({ ...x, source: undefined }) });
  }
  if (f.isNew) chips.push({ key: 'isNew', field: 'isNew', label: 'New today', remove: (x) => ({ ...x, isNew: undefined }) });
  return chips;
}

/** Filters set in the filter panel (everything except the search words and cities). */
export function countPanelFilters(f: UrlFilters): number {
  return buildChips(f).filter((c) => c.field !== 'q' && c.field !== 'cities').length;
}

export const PARSED_BY_LABEL: Record<'rules' | 'jev' | 'llm' | 'cache', string> = {
  rules: 'Parsed by rules',
  jev: 'Parsed by Jev',
  llm: 'Parsed by LLM',
  cache: 'Parsed from cache',
};

/** Quick toggles under the search box. A toggle is "on" when the URL filter it controls has its value. */
export interface ToggleChip {
  key: string;
  label: string;
  isOn: (f: UrlFilters) => boolean;
  /** The filters with this toggle switched to `on`. */
  set: (f: UrlFilters, on: boolean) => UrlFilters;
}

export const TOGGLE_CHIPS: ToggleChip[] = [
  {
    key: 'internship',
    label: 'Internship',
    isOn: (f) => f.jobType === 'internship',
    set: (f, on) => ({ ...f, jobType: on ? 'internship' : undefined }),
  },
  {
    key: 'full_time',
    label: 'Full time',
    isOn: (f) => f.jobType === 'full_time',
    set: (f, on) => ({ ...f, jobType: on ? 'full_time' : undefined }),
  },
  {
    key: 'stipend',
    label: 'With stipend',
    isOn: (f) => (f.stipendMin ?? 0) >= 1,
    set: (f, on) => ({ ...f, stipendMin: on ? Math.max(1, f.stipendMin ?? 1) : undefined }),
  },
  {
    key: 'remote',
    label: 'Remote',
    isOn: (f) => f.workMode === 'remote',
    set: (f, on) => ({ ...f, workMode: on ? 'remote' : undefined }),
  },
  {
    key: 'new',
    label: 'New today',
    isOn: (f) => !!f.isNew,
    set: (f, on) => ({ ...f, isNew: on || undefined }),
  },
];

/** Chips for the active filters the toggles do not already show (search words, role, cities, other values). */
export function buildActiveChips(f: UrlFilters): FilterChip[] {
  return buildChips(f).filter((c) => {
    if (c.key === 'jobType') return f.jobType !== 'internship' && f.jobType !== 'full_time';
    if (c.key === 'workMode') return f.workMode !== 'remote';
    if (c.key === 'isNew') return false;
    if (c.key === 'stipendMin') return (f.stipendMin ?? 0) > 1; // "Paid only" is the With stipend toggle
    return true;
  });
}

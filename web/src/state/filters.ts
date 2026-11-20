import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { JobType, ParsedFilters, RoleCategory, WorkMode } from '../api/types.ts';

/**
 * All filter state lives in the URL (shareable, Back/Forward works, refresh keeps it).
 * One shape is used by the search bar, the filter panel, the list and the map.
 */
export interface UrlFilters {
  q?: string;
  role?: RoleCategory;
  cities: string[];
  jobType?: JobType;
  workMode?: WorkMode;
  stipendMin?: number;
  postedWithinDays?: number;
  source?: string;
  isNew?: boolean;
}

export function readFilters(sp: URLSearchParams): UrlFilters {
  const num = (k: string) => {
    const v = sp.get(k);
    return v && !Number.isNaN(Number(v)) ? Number(v) : undefined;
  };
  return {
    q: sp.get('q') || undefined,
    role: (sp.get('role') as RoleCategory) || undefined,
    cities: sp.getAll('city'),
    jobType: (sp.get('jobType') as JobType) || undefined,
    workMode: (sp.get('workMode') as WorkMode) || undefined,
    stipendMin: num('stipendMin'),
    postedWithinDays: num('postedWithinDays'),
    source: sp.get('source') || undefined,
    isNew: sp.get('isNew') === 'true' || undefined,
  };
}

/** Query string for /jobs and /cities/summary (API parameter names). */
export function filtersToQuery(f: UrlFilters): URLSearchParams {
  const qs = new URLSearchParams();
  if (f.q) qs.set('q', f.q);
  if (f.role) qs.set('role', f.role);
  for (const c of f.cities) qs.append('city', c);
  if (f.jobType) qs.set('jobType', f.jobType);
  if (f.workMode) qs.set('workMode', f.workMode);
  if (f.stipendMin != null) qs.set('stipendMin', String(f.stipendMin));
  if (f.postedWithinDays != null) qs.set('postedWithinDays', String(f.postedWithinDays));
  if (f.source) qs.set('source', f.source);
  if (f.isNew) qs.set('isNew', 'true');
  return qs;
}

/** Map the NL parser's filters onto URL filters (keywords join q). */
export function fromParsed(p: ParsedFilters): UrlFilters {
  const words = [...(p.keywords ?? []), ...(p.q ? [p.q] : [])].join(' ').trim();
  return {
    q: words || undefined,
    role: p.roleCategory ?? undefined,
    cities: p.cities ?? [],
    jobType: p.jobType ?? undefined,
    workMode: p.workMode ?? undefined,
    stipendMin: p.stipendMin ?? undefined,
    postedWithinDays: p.postedWithinDays ?? undefined,
    source: p.source ?? undefined,
    isNew: p.isNew || undefined,
  };
}

export const isEmptyFilters = (f: UrlFilters) => filtersToQuery(f).toString() === '';

/**
 * Hook: current filters + setters. Non-filter params (job, view, etc.) are preserved.
 * `replace` for typing-driven updates so history is not spammed; push for deliberate changes.
 */
export function useFilters() {
  const [sp, setSp] = useSearchParams();
  const filters = useMemo(() => readFilters(sp), [sp]);

  const setFilters = useCallback(
    (next: UrlFilters | ((prev: UrlFilters) => UrlFilters), opts: { replace?: boolean } = {}) => {
      setSp(
        (prev) => {
          const cur = readFilters(prev);
          const value = typeof next === 'function' ? next(cur) : next;
          const out = new URLSearchParams();
          // keep non-filter params
          for (const [k, v] of prev.entries()) {
            if (!FILTER_KEYS.has(k)) out.append(k, v);
          }
          for (const [k, v] of filtersToQuery(value).entries()) out.append(k, v);
          return out;
        },
        { replace: opts.replace },
      );
    },
    [setSp],
  );

  const clear = useCallback(() => setFilters({ cities: [] }), [setFilters]);
  return { filters, setFilters, clear };
}

const FILTER_KEYS = new Set(['q', 'role', 'city', 'jobType', 'workMode', 'stipendMin', 'postedWithinDays', 'source', 'isNew']);

/** Selected job lives in the URL as ?job=<id> so the card is deep-linkable on any view. */
export function useSelectedJob() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('job');
  const jobId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const select = useCallback(
    (id: number | null) =>
      setSp((prev) => {
        const out = new URLSearchParams(prev);
        if (id == null) out.delete('job');
        else out.set('job', String(id));
        return out;
      }),
    [setSp],
  );
  return { jobId, select };
}

/** City the map is focused on (?focus=Pune). Set by a click on a column or by NL search's focusCity. */
export function useFocusCity() {
  const [sp, setSp] = useSearchParams();
  const focus = sp.get('focus');
  const setFocus = useCallback(
    (city: string | null) =>
      setSp(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (!city) out.delete('focus');
          else out.set('focus', city);
          return out;
        },
        { replace: true },
      ),
    [setSp],
  );
  return { focus, setFocus };
}

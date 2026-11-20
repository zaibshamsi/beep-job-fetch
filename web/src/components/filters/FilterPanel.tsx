import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { useId } from 'react';
import { useFilterOptions } from '../../api/queries.ts';
import { WORK_MODE_LABEL } from '../../api/types.ts';
import type { RoleCategory, WorkMode } from '../../api/types.ts';
import { GROUP_ORDER } from '../../design/roleGroups.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';
import type { UrlFilters } from '../../state/filters.ts';
import { formatNumber } from '../jobs/format.ts';
import { sourceName } from '../jobs/sources.ts';
import { ErrorState } from '../jobs/states.tsx';
import { useExploreState } from '../jobs/useExploreState.ts';
import { buildChips, postedLabel, stipendLabel } from '../search/chips.ts';
import './filters.css';

const WORK_MODES: WorkMode[] = ['onsite', 'hybrid', 'remote'];
const STIPEND_STEPS = [5000, 10000, 20000];
const DEFAULT_POSTED = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
];

const withCount = (label: string, count?: number) => (count == null ? label : `${label} (${formatNumber(count)})`);
const PANEL_FIELDS = new Set(['role', 'workMode', 'stipendMin', 'postedWithinDays', 'source']);

interface Props {
  fam: RoleGroup | null;
  onFam: (g: RoleGroup | null) => void;
}

/** "Filters" disclosure for what the chips do not cover. Open state lives in the URL as ?panel=filters. */
export function FilterPanel({ fam, onFam }: Props) {
  const { filters, filtersOpen, update } = useExploreState();
  const regionId = useId();
  const active = buildChips(filters).filter((c) => PANEL_FIELDS.has(c.field)).length + (fam ? 1 : 0);

  const toggle = () => update({ params: { panel: filtersOpen ? null : 'filters' } }, { replace: true });

  return (
    <section className="mp-filters" aria-label="More filters">
      <button type="button" className="mp-filters__toggle" aria-expanded={filtersOpen} aria-controls={regionId} onClick={toggle}>
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span>Filters</span>
        {active > 0 && (
          <span className="mp-filters__count mono" aria-label={`${active} active`}>
            {active}
          </span>
        )}
        <ChevronDown size={15} aria-hidden="true" className="mp-filters__chev" data-open={filtersOpen || undefined} />
      </button>
      <div id={regionId} className="mp-filters__region" hidden={!filtersOpen}>
        {filtersOpen && <FilterControls filters={filters} fam={fam} onFam={onFam} set={(next) => update({ filters: next })} />}
      </div>
    </section>
  );
}

function FilterControls({
  filters,
  fam,
  onFam,
  set,
}: {
  filters: UrlFilters;
  fam: RoleGroup | null;
  onFam: (g: RoleGroup | null) => void;
  set: (fn: (f: UrlFilters) => UrlFilters) => void;
}) {
  const opts = useFilterOptions();
  const o = opts.data;
  const ids = { family: useId(), role: useId(), mode: useId(), posted: useId(), source: useId(), stipend: useId() };

  const roles = o?.roles ?? [];
  const roleList = filters.role && !roles.some((r) => r.role === filters.role) ? [{ role: filters.role, count: undefined }, ...roles] : roles;

  const posted: { label: string; days: number; count?: number }[] = o?.postedRanges ?? DEFAULT_POSTED;
  const postedList =
    filters.postedWithinDays && !posted.some((p) => p.days === filters.postedWithinDays)
      ? [...posted, { label: postedLabel(filters.postedWithinDays), days: filters.postedWithinDays }].sort((a, b) => a.days - b.days)
      : posted;

  const sources: { source: string; count?: number }[] = o?.sources ?? [];
  const sourceList = filters.source && !sources.some((s) => s.source === filters.source) ? [{ source: filters.source }, ...sources] : sources;

  const stipend = filters.stipendMin ?? 0;
  const stipendSteps = stipend > 1 && !STIPEND_STEPS.includes(stipend) ? [...STIPEND_STEPS, stipend].sort((a, b) => a - b) : STIPEND_STEPS;
  const modeCount = (v: WorkMode) => o?.workModes.find((t) => t.value === v)?.count;

  return (
    <div className="mp-filters__body">
      {opts.isError && <ErrorState error={opts.error} onRetry={() => opts.refetch()} compact />}

      <div className="field">
        <label htmlFor={ids.family}>Role family</label>
        <select id={ids.family} value={fam ?? ''} disabled={!!filters.role} onChange={(e) => onFam((e.target.value || null) as RoleGroup | null)}>
          <option value="">All families</option>
          {GROUP_ORDER.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor={ids.role}>Role</label>
        <select
          id={ids.role}
          value={filters.role ?? ''}
          onChange={(e) => set((f) => ({ ...f, role: (e.target.value || undefined) as RoleCategory | undefined }))}
        >
          <option value="">{opts.isPending ? 'All roles (loading counts…)' : 'All roles'}</option>
          {roleList.map((r) => (
            <option key={r.role} value={r.role}>
              {withCount(r.role, r.count)}
            </option>
          ))}
        </select>
      </div>

      <div className="mp-filters__pair">
        <div className="field">
          <label htmlFor={ids.mode}>Work mode</label>
          <select
            id={ids.mode}
            value={filters.workMode ?? ''}
            onChange={(e) => set((f) => ({ ...f, workMode: (e.target.value || undefined) as WorkMode | undefined }))}
          >
            <option value="">Any</option>
            {WORK_MODES.map((m) => (
              <option key={m} value={m} disabled={modeCount(m) === 0 && filters.workMode !== m}>
                {withCount(WORK_MODE_LABEL[m], modeCount(m))}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={ids.stipend}>Minimum stipend</label>
          <select
            id={ids.stipend}
            value={stipend > 1 ? String(stipend) : ''}
            onChange={(e) => {
              const v = Number(e.target.value);
              set((f) => ({ ...f, stipendMin: v > 1 ? v : (f.stipendMin ?? 0) >= 1 ? 1 : undefined }));
            }}
          >
            <option value="">Any amount</option>
            {stipendSteps.map((s) => (
              <option key={s} value={s}>
                {stipendLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mp-filters__pair">
        <div className="field">
          <label htmlFor={ids.posted}>Posted within</label>
          <select
            id={ids.posted}
            value={filters.postedWithinDays ? String(filters.postedWithinDays) : ''}
            onChange={(e) => set((f) => ({ ...f, postedWithinDays: Number(e.target.value) || undefined }))}
          >
            <option value="">Any time</option>
            {postedList.map((p) => (
              <option key={p.days} value={p.days}>
                {withCount(p.label, p.count)}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor={ids.source}>Source</label>
          <select id={ids.source} value={filters.source ?? ''} onChange={(e) => set((f) => ({ ...f, source: e.target.value || undefined }))}>
            <option value="">{opts.isPending ? 'All sources (loading…)' : 'All sources'}</option>
            {sourceList.map((s) => (
              <option key={s.source} value={s.source}>
                {withCount(sourceName(s.source), s.count)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

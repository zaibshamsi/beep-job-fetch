import { X } from 'lucide-react';
import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { GROUP_COLOR } from '../../design/roleGroups.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';
import { useExploreState } from '../jobs/useExploreState.ts';
import { buildActiveChips, TOGGLE_CHIPS } from './chips.ts';

interface Props {
  /** Role family highlighted from the map (local state), shown as a removable chip. */
  fam: RoleGroup | null;
  onClearFam: () => void;
}

/**
 * The chips row: first the active filters you can remove (city, words, role, ...), then the five quick toggles.
 * Everything reads and writes the URL filters, whoever set them (search box, map, filter panel).
 */
export function FilterChips({ fam, onClearFam }: Props) {
  const { filters, focus, update } = useExploreState();
  const chips = useMemo(() => buildActiveChips(filters), [filters]);
  const focusChip = focus && !filters.cities.includes(focus) ? focus : null;

  return (
    <div className="chips mp-chips" role="group" aria-label="Filters">
      {focusChip && (
        <button type="button" className="chip on" aria-label={`Remove filter: ${focusChip}`} onClick={() => update({ params: { focus: null } }, { replace: true })}>
          {focusChip}
          <X size={13} aria-hidden="true" />
        </button>
      )}
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className="chip on"
          aria-label={`Remove filter: ${c.label}`}
          onClick={() => update({ filters: c.remove, ...(c.key === `city:${focus}` ? { params: { focus: null } } : {}) })}
        >
          {c.label}
          <X size={13} aria-hidden="true" />
        </button>
      ))}
      {fam && (
        <button
          type="button"
          className="chip on mp-chip--fam"
          style={{ '--c': GROUP_COLOR[fam] } as CSSProperties}
          aria-label={`Remove filter: ${fam} roles`}
          onClick={onClearFam}
        >
          <i aria-hidden="true" />
          {fam}
          <X size={13} aria-hidden="true" />
        </button>
      )}
      {TOGGLE_CHIPS.map((t) => {
        const on = t.isOn(filters);
        return (
          <button key={t.key} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => update({ filters: (f) => t.set(f, !on) })}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

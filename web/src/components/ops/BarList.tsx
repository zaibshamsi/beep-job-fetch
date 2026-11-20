import type { RoleCategory } from '../../api/types.ts';
import { GROUP_COLOR, GROUP_ORDER, groupOf, type RoleGroup } from '../../design/roleGroups.ts';
import { formatInt, formatPercent } from './format.ts';

export interface BarItem {
  label: string;
  value: number;
}

/** The role family colour for a label from the API; anything unknown falls back to "Other". */
export function roleFamily(label: string): RoleGroup {
  return groupOf(label as RoleCategory) ?? 'Other';
}

/**
 * A ranked list with bars scaled to the largest value and the count (and share of `total`) as text.
 * `colorBy="role"` fills each bar with its role family colour; otherwise bars use the brand gradient.
 */
export function BarList({
  items,
  limit = 10,
  total,
  caption,
  unit = 'jobs',
  colorBy,
}: {
  items: BarItem[];
  limit?: number;
  total?: number;
  caption: string;
  unit?: string;
  colorBy?: 'role';
}) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, limit);
  const max = Math.max(1, ...top.map((i) => i.value));
  const families = colorBy === 'role' ? GROUP_ORDER.filter((g) => top.some((i) => roleFamily(i.label) === g)) : [];
  return (
    <figure className="ops-bars">
      <figcaption className="visually-hidden">{caption}</figcaption>
      <ol className="ops-bars__list">
        {top.map((i) => (
          <li key={i.label} className="ops-bars__row">
            <span className="ops-bars__label" title={i.label}>
              {i.label}
            </span>
            <span className="ops-bars__track" aria-hidden="true">
              <span
                className="ops-bars__bar"
                style={{
                  width: `${(i.value / max) * 100}%`,
                  ...(colorBy === 'role' ? { background: GROUP_COLOR[roleFamily(i.label)] ?? GROUP_COLOR.Other } : null),
                }}
              />
            </span>
            <span className="ops-bars__value num mono">
              {formatInt(i.value)}
              <span className="visually-hidden"> {unit}</span>
              {total ? <span className="ops-bars__share">{formatPercent((i.value / total) * 100, 0)}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {families.length > 0 && (
        <ul className="ops-legend ops-legend--families" aria-label="Colour by role family">
          {families.map((g) => (
            <li key={g} className="ops-legend__item" style={{ ['--c' as string]: GROUP_COLOR[g] }}>
              {g}
            </li>
          ))}
        </ul>
      )}
      {items.length > limit && (
        <p className="ops-bars__more">
          Top {limit} of {formatInt(items.length)}. The other {formatInt(items.length - limit)} hold{' '}
          {formatInt(sorted.slice(limit).reduce((s, i) => s + i.value, 0))} {unit}.
        </p>
      )}
    </figure>
  );
}

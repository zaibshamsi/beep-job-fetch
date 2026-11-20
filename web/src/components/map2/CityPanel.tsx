import { ArrowLeft } from 'lucide-react';
import { GROUP_COLOR } from '../../design/roleGroups.ts';
import type { RoleGroup } from '../../design/roleGroups.ts';
import { formatNumber } from '../jobs/format.ts';
import type { FamilyCount } from './families.ts';
import { payShort } from './useCityData.ts';
import type { CityStats } from './useCityData.ts';

interface Props {
  name: string;
  /** Open roles under the current filters (the beacon's number). */
  count: number | null;
  stats: CityStats;
  families: FamilyCount[];
  familiesLoading: boolean;
  fam: RoleGroup | null;
  onToggleFam: (g: RoleGroup) => void;
  onBack: () => void;
}

const num = (n: number | null) => (n == null ? '—' : formatNumber(n));

/** Glass panel at the top left of the map card: back button, city name, three stat tiles and the role families. */
export function CityPanel({ name, count, stats, families, familiesLoading, fam, onToggleFam, onBack }: Props) {
  return (
    <section className="m2-city glass" aria-label={`${name} overview`}>
      <button type="button" className="m2-back" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" />
        All India
      </button>
      <span className="eb">City view</span>
      <h2 className="serif" style={name.length > 11 ? { fontSize: name.length > 15 ? 30 : 38 } : undefined}>
        {name}
      </h2>
      <p className="m2-city__count">
        <b className="mono g">{num(count)}</b> open {count === 1 ? 'role' : 'roles'}
      </p>

      <div className="m2-city__stats" aria-busy={stats.loading || undefined}>
        <div>
          <b className="mono">{num(stats.internships)}</b>
          <span>Internships</span>
        </div>
        <div>
          <b className="mono">{num(stats.fullTime)}</b>
          <span>Full time</span>
        </div>
        <div>
          <b className="mono">{payShort(stats.avgPay)}</b>
          <span>Avg. pay</span>
        </div>
      </div>

      <div className="m2-city__cats" role="group" aria-label="Role families" aria-busy={familiesLoading || undefined}>
        {families.length === 0 && familiesLoading && (
          <>
            {[72, 58, 64].map((w) => (
              <span key={w} className="mp-skel" style={{ width: `${w}%`, height: 14 }} aria-hidden="true" />
            ))}
          </>
        )}
        {families.map((f) => (
          <button
            key={f.group}
            type="button"
            className={`m2-cat${fam === f.group ? ' is-on' : ''}`}
            style={{ ['--c' as string]: GROUP_COLOR[f.group] }}
            aria-pressed={fam === f.group}
            onClick={() => onToggleFam(f.group)}
          >
            <i aria-hidden="true" />
            {f.group}
            <em>{formatNumber(f.count)}</em>
          </button>
        ))}
      </div>
    </section>
  );
}

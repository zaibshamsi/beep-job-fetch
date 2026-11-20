import { Globe } from 'lucide-react';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_URL } from '../../map/attribution.ts';
import { formatNumber } from '../jobs/format.ts';

/** Bottom-left button: remote roles are not a place, so they are a button, not a beacon. */
export function RemoteButton({ count, active, onClick }: { count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`m2-remote glass${active ? ' is-on' : ''}`} aria-pressed={active} onClick={onClick}>
      <Globe size={26} aria-hidden="true" />
      <span>
        <b className="mono">{formatNumber(count)}</b> remote {count === 1 ? 'role' : 'roles'}
      </span>
      <small>Work from anywhere</small>
    </button>
  );
}

export function Legend({ view3d }: { view3d: boolean }) {
  return (
    <div className="m2-legend glass">
      <span className="m2-legend__dot" aria-hidden="true" />
      {view3d ? 'Column height = open roles' : 'Beacon size = open roles'}
    </div>
  );
}

/** 2D / 3D: the choice lives in the URL as ?view=3d. */
export function ViewSwitch({ view3d, onChange }: { view3d: boolean; onChange: (v3d: boolean) => void }) {
  return (
    <div className="m2-view glass" role="radiogroup" aria-label="Map view">
      {[
        { v3: false, label: '2D' },
        { v3: true, label: '3D' },
      ].map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={view3d === o.v3}
          className={view3d === o.v3 ? 'is-on' : undefined}
          onClick={() => onChange(o.v3)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Boundary credit required by the licence of the outline (src/map/attribution.ts). Always visible. */
export function Attribution() {
  return (
    <p className="m2-attr">
      <a href={MAP_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">
        {MAP_ATTRIBUTION}
      </a>
    </p>
  );
}

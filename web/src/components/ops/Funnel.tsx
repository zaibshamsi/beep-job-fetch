import { formatInt, formatPercent } from './format.ts';

export interface FunnelStep {
  label: string;
  value: number;
  /** kept: posts that move on; removed: posts dropped at this step; flag: posts marked for a person to check. */
  kind: 'kept' | 'removed' | 'flag';
  hint?: string;
}

/**
 * The run's stages as horizontal bars, each scaled to the first step (posts fetched), with the count and its share
 * written beside it. Drawn with CSS only; colours from DESIGN.md's chart sequence, always with a text label.
 */
export function Funnel({ steps, caption }: { steps: FunnelStep[]; caption: string }) {
  const base = Math.max(1, steps[0]?.value ?? 1);
  return (
    <figure className="ops-funnel">
      <figcaption className="visually-hidden">{caption}</figcaption>
      <ol className="ops-funnel__list">
        {steps.map((s, i) => {
          const share = (s.value / base) * 100;
          return (
            <li key={s.label} className={`ops-funnel__row ops-funnel__row--${s.kind}`}>
              <div className="ops-funnel__head">
                <span className="ops-funnel__label">{s.label}</span>
                <span className="ops-funnel__value num mono">
                  {formatInt(s.value)}
                  {i > 0 && <span className="ops-funnel__share">{formatPercent(share, share < 1 && share > 0 ? 1 : 0)}</span>}
                </span>
              </div>
              <div className="ops-funnel__track" aria-hidden="true">
                <span className="ops-funnel__bar" style={{ width: `${Math.max(s.value > 0 ? 0.6 : 0, Math.min(100, share))}%` }} />
              </div>
              {s.hint && <p className="ops-funnel__hint">{s.hint}</p>}
            </li>
          );
        })}
      </ol>
      <div className="ops-legend" aria-hidden="true">
        <span className="ops-legend__item ops-legend__item--kept">Moves on</span>
        <span className="ops-legend__item ops-legend__item--removed">Dropped</span>
        <span className="ops-legend__item ops-legend__item--flag">Marked for review</span>
      </div>
    </figure>
  );
}

import type { ReactNode } from 'react';
import { Skeleton } from './States.tsx';

/**
 * One figure with its label and a line of context. `value` null shows the "not measured yet" state.
 * `accent` puts the gradient on the number: use it on the single most important figure of a page.
 */
export function KpiCard({
  label,
  value,
  unit,
  sub,
  loading,
  empty = 'Not measured yet',
  footer,
  accent,
}: {
  label: string;
  value: ReactNode | null;
  unit?: string;
  sub?: ReactNode;
  loading?: boolean;
  empty?: string;
  footer?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card ops-kpi">
      <p className="ops-kpi__label">{label}</p>
      {loading ? (
        <>
          <Skeleton h={38} w="60%" />
          <Skeleton h={14} w="80%" />
        </>
      ) : value == null ? (
        <>
          <p className="ops-kpi__none">{empty}</p>
          {sub && <p className="ops-kpi__sub">{sub}</p>}
        </>
      ) : (
        <>
          <p className="ops-kpi__value num mono">
            <span className={accent ? 'g' : undefined}>{value}</span>
            {unit && <span className="ops-kpi__unit">{unit}</span>}
          </p>
          {sub && <p className="ops-kpi__sub">{sub}</p>}
        </>
      )}
      {footer && !loading && <div className="ops-kpi__footer">{footer}</div>}
    </div>
  );
}

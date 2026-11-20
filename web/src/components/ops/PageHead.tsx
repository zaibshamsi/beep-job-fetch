import type { ReactNode } from 'react';

/** Page header: mono eyebrow, h1 with one serif gradient phrase, a muted hard-fact line, an optional main action. */
export function PageHead({
  eyebrow,
  title,
  accent,
  children,
  action,
}: {
  eyebrow: string;
  /** Plain words before the gradient phrase. */
  title: ReactNode;
  /** The one Instrument Serif italic gradient phrase. */
  accent: string;
  /** The muted line of hard facts. */
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="ops-head">
      <div className="ops-head__text">
        <span className="eb">{eyebrow}</span>
        <h1>
          {title} <em className="serif g">{accent}</em>
        </h1>
        {children}
      </div>
      {action}
    </header>
  );
}

/** Section header: numbered mono eyebrow, h2 with one serif gradient phrase, optional meta line. */
export function SectionHead({
  eyebrow,
  title,
  accent,
  id,
  meta,
}: {
  eyebrow: string;
  title?: ReactNode;
  accent: string;
  id?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="ops-section__head">
      <span className="eb">{eyebrow}</span>
      <h2 id={id}>
        {title}
        {title ? ' ' : null}
        <em className="serif g">{accent}</em>
      </h2>
      {meta && <p className="ops-section__meta">{meta}</p>}
    </div>
  );
}

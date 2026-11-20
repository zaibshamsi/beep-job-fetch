import type { CSSProperties, ReactNode, RefObject } from 'react';
import { useCountUp, useInView } from './hooks.ts';
import { fmtNum } from './format.ts';

/** Reveal-on-scroll: spread `cls` and `style` on the element, attach `ref`. `seen` also drives counters and bars. */
export function useReveal<T extends Element>(delay = 0) {
  const [ref, seen] = useInView<T>(true, 0.15);
  return {
    ref: ref as RefObject<T | null>,
    seen,
    cls: seen ? 'rv in' : 'rv',
    style: (delay ? { transitionDelay: `${delay}s` } : undefined) as CSSProperties | undefined,
  };
}

export function SectionHead({ eyebrow, children, text, delay }: { eyebrow: string; children: ReactNode; text?: string; delay?: number }) {
  const r = useReveal<HTMLDivElement>(delay);
  return (
    <div ref={r.ref} className={`ld-hd ${r.cls}`} style={r.style}>
      <span className="eb">{eyebrow}</span>
      <h2>{children}</h2>
      {text && <p>{text}</p>}
    </div>
  );
}

/** Whole number that counts up once when `active` turns true. */
export function CountUp({ value, active }: { value: number | null | undefined; active: boolean }) {
  const v = useCountUp(value, active);
  return <>{fmtNum(v)}</>;
}

export function ErrorNote({ what, onRetry }: { what: string; onRetry?: () => void }) {
  return (
    <div className="ld-err" role="status">
      <span>{what} could not be loaded.</span>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

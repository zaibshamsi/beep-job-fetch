import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { explainError, getAdminToken, setAdminToken } from './opsApi.ts';

/**
 * Loading shows after 200 ms and, once shown, stays at least 400 ms (DESIGN.md section 4), so a fast answer
 * never flashes a skeleton.
 */
export function useDelayedFlag(on: boolean, delay = 200, minVisible = 400): boolean {
  const [shown, setShown] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (on) {
      const t = window.setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, delay);
      return () => window.clearTimeout(t);
    }
    if (!shown) return;
    const left = Math.max(0, minVisible - (Date.now() - shownAt.current));
    const t = window.setTimeout(() => setShown(false), left);
    return () => window.clearTimeout(t);
  }, [on, shown, delay, minVisible]);
  return shown;
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <span className="ops-skel" style={{ height: h, width: w, ...style }} aria-hidden="true" />;
}

/** A block that holds `rows` skeleton lines of the final layout's height while its data loads. */
export function SkeletonRows({ rows = 4, h = 40, label = 'Loading' }: { rows?: number; h?: number; label?: string }) {
  return (
    <div className="ops-skel-rows" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} h={h} w={`${100 - ((i * 13) % 30)}%`} />
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ops-empty">
      <p className="ops-empty__title">{title}</p>
      {children && <p className="ops-empty__text">{children}</p>}
    </div>
  );
}

/** An error in words: what happened, how to fix it, a retry button, and the admin-token field when that is the fix. */
export function ErrorBlock({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const e = explainError(error);
  return (
    <div className={`ops-error${compact ? ' ops-error--compact' : ''}`} role="alert">
      <p className="ops-error__title">{e.title}</p>
      {e.fix && <p className="ops-error__fix">{e.fix}</p>}
      {e.needsToken && <AdminTokenField onSaved={onRetry} />}
      {onRetry && !e.needsToken && (
        <div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function AdminTokenField({ onSaved }: { onSaved?: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(getAdminToken() ?? '');
  const [show, setShow] = useState(false);
  return (
    <form
      className="ops-token"
      onSubmit={(ev) => {
        ev.preventDefault();
        setAdminToken(value.trim() || null);
        void qc.invalidateQueries();
        onSaved?.();
      }}
    >
      <div className="field">
        <label htmlFor="ops-admin-token">Admin token</label>
        <div className="ops-secret">
          <input
            id="ops-admin-token"
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(ev) => setValue(ev.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
          />
          <button type="button" className="ops-secret__toggle" onClick={() => setShow((s) => !s)} aria-pressed={show}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <button type="submit" className="btn btn--secondary btn--sm">
        Use token
      </button>
    </form>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className="ops-spinner" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

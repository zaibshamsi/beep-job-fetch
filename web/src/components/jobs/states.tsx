import { RotateCw, SearchX } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '../../api/client.ts';

export const API_DOWN = 'The API is not answering. Start it with npm run api, then retry.';

/**
 * ApiError by shape, not instanceof: the dev server can load api/client.ts under two URLs
 * (/src/... and /@fs/C:/...), which makes two ApiError classes.
 */
export function asApiError(err: unknown): ApiError | null {
  if (err instanceof ApiError) return err;
  if (err && typeof err === 'object' && typeof (err as ApiError).status === 'number' && typeof (err as ApiError).code === 'string') {
    return err as ApiError;
  }
  return null;
}

/** What went wrong, in words a person can act on. */
export function describeError(raw: unknown): string {
  const err = asApiError(raw);
  if (err) {
    if (err.code === 'DB_UNAVAILABLE') return 'The API cannot reach the database. Check that SQL Server is running, then retry.';
    // The dev proxy answers 5xx without a JSON body when nothing listens on the API port.
    if (!err.body && err.status >= 500) return API_DOWN;
    if (err.status === 404) return 'No job matches this link. It may have been removed from the database.';
    return err.message || API_DOWN;
  }
  return API_DOWN; // fetch threw: network down or API not started
}

export function ErrorState({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={`mp-state mp-state--error${compact ? ' mp-state--compact' : ''}`} role="alert">
      <p>{describeError(error)}</p>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
          <RotateCw size={16} aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

/** Nothing matches: the mock's centred empty state (icon, bold title, one line of help). */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mp-state mp-state--empty" role="status">
      <SearchX size={28} aria-hidden="true" />
      <b>{title}</b>
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <span className="mp-spinner" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { createLogger } from '@beep/shared';

const log = createLogger('api');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Extra top-level fields merged into the JSON body (for example runId on a 409). */
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export const notFound = (what = 'Resource') => new ApiError(404, 'NOT_FOUND', `${what} not found`);
export const badRequest = (message: string) => new ApiError(400, 'BAD_REQUEST', message);

/** mssql connection-level failures: the server is down, the login failed, or the pool is closed. */
const DB_DOWN_CODES = new Set(['ESOCKET', 'ELOGIN', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN', 'ECONNRESET', 'ECONNREFUSED']);
export function isDbUnavailable(err: unknown): boolean {
  const e = err as { code?: string; name?: string } | null;
  return !!e && (e.name === 'ConnectionError' || (typeof e.code === 'string' && DB_DOWN_CODES.has(e.code)));
}

export function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message }, ...extra };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json(errorBody('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

// Express identifies error middleware by arity, so all four parameters must stay.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json(errorBody(err.code, err.message, err.extra));
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    res.status(400).json(errorBody('VALIDATION_ERROR', message));
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json(errorBody('BAD_JSON', 'Request body is not valid JSON'));
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json(errorBody('PAYLOAD_TOO_LARGE', 'Request body is too large'));
    return;
  }
  if (isDbUnavailable(err)) {
    log.error(`database unreachable on ${req.method} ${req.path}: ${err.message}`);
    res.status(503).json(errorBody('DB_UNAVAILABLE', 'The database is unreachable. Check that SQL Server is running and the DB_* settings in .env are right.'));
    return;
  }
  log.error(`unhandled error on ${req.method} ${req.path}`, err);
  res.status(500).json(errorBody('INTERNAL', 'Something went wrong on the server'));
};

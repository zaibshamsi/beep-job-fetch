import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ApiError } from './errors.ts';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Open when no token is configured (local use); otherwise requires the x-admin-token header. */
export function adminGuard(token: string): RequestHandler {
  return (req, _res, next) => {
    if (!token) return next();
    const given = req.header('x-admin-token');
    if (!given) return next(new ApiError(401, 'UNAUTHORIZED', 'Missing x-admin-token header'));
    if (!same(given, token)) return next(new ApiError(403, 'FORBIDDEN', 'Invalid admin token'));
    next();
  };
}

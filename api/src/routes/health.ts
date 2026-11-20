import { Router } from 'express';
import { query } from '@beep/shared';

export const healthRouter = Router();

/** Liveness. Stays 200 when the DB is down so Docker keeps the API up; `db` says whether SQL Server answered. */
healthRouter.get('/health', async (_req, res) => {
  let db = false;
  try {
    await query('SELECT 1 AS ok');
    db = true;
  } catch {
    db = false;
  }
  res.json({ ok: true, db });
});

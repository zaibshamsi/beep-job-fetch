import sql from 'mssql';
import { env } from './env.ts';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool({
      server: env.db.server,
      port: env.db.port,
      database: env.db.database,
      user: env.db.user,
      password: env.db.password,
      options: { encrypt: env.db.encrypt, trustServerCertificate: env.db.trustServerCertificate },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
      requestTimeout: 60_000,
    });
    poolPromise = pool.connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

export async function closePool(): Promise<void> {
  if (poolPromise) {
    const p = await poolPromise;
    poolPromise = null;
    await p.close();
  }
}

export type SqlParams = Record<string, unknown>;

/** Run a parameterised query. Use @name placeholders; params are passed by name. */
export async function query<T = Record<string, any>>(text: string, params: SqlParams = {}): Promise<T[]> {
  const pool = await getPool();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v as any);
  const res = await req.query(text);
  return (res.recordset ?? []) as T[];
}

/** Run a statement and return rows affected (first count). */
export async function exec(text: string, params: SqlParams = {}): Promise<number> {
  const pool = await getPool();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v as any);
  const res = await req.query(text);
  return res.rowsAffected?.[0] ?? 0;
}

/** Run fn inside a transaction. fn receives a request factory bound to the transaction. */
export async function withTransaction<T>(fn: (q: (text: string, params?: SqlParams) => Promise<any[]>) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const q = async (text: string, params: SqlParams = {}) => {
      const req = new sql.Request(tx);
      for (const [k, v] of Object.entries(params)) req.input(k, v as any);
      const res = await req.query(text);
      return res.recordset ?? [];
    };
    const out = await fn(q);
    await tx.commit();
    return out;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

export { sql };

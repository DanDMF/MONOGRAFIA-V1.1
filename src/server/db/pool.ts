import pg from "pg";

// numeric/decimal permanecem string (sem perda de precisão); date permanece "AAAA-MM-DD" (data civil, sem fuso).
pg.types.setTypeParser(1082, (v: string) => v);

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10 });
}

export async function q<T = Record<string, unknown>>(db: Queryable, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}

export async function one<T = Record<string, unknown>>(db: Queryable, sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await q<T>(db, sql, params);
  return rows[0];
}

/** Executa várias gravações numa única transação. */
export async function tx<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

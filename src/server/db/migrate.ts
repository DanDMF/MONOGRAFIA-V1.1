// Migrador SQL: aplica ficheiros migrations/NNNN_*.sql por ordem, uma vez, em transação,
// guardando checksum. Nunca apaga dados; recusa migração já aplicada cujo conteúdo mudou.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type pg from "pg";

export const MIGRATIONS_DIR = path.resolve(process.env.MIGRATIONS_DIR ?? "migrations");

export async function migrate(pool: pg.Pool, dir = MIGRATIONS_DIR, log: (m: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock(727274)");
    await client.query(`create table if not exists schema_migration (
      name text primary key, checksum text not null, applied_at timestamptz not null default now())`);
    const done = new Map(
      (await client.query<{ name: string; checksum: string }>("select name, checksum from schema_migration")).rows.map(
        (r) => [r.name, r.checksum],
      ),
    );
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const prev = done.get(f);
      if (prev) {
        if (prev !== checksum) throw new Error(`Migração ${f} já aplicada foi alterada. Criar nova migração em vez de editar.`);
        continue;
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migration (name, checksum) values ($1, $2)", [f, checksum]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw new Error(`Falha na migração ${f}: ${(e as Error).message}`);
      }
      applied.push(f);
      log(`aplicada ${f}`);
    }
  } finally {
    await client.query("select pg_advisory_unlock(727274)").catch(() => undefined);
    client.release();
  }
  return applied;
}

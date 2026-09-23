// Fila persistente em PostgreSQL: reclamação com FOR UPDATE SKIP LOCKED, idempotência por chave,
// retentativas limitadas com espera exponencial, cancelamento cooperativo e recuperação de tarefas órfãs.
import os from "node:os";
import type pg from "pg";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";

export type JobStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface JobRow {
  id: string;
  project_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  progress: unknown;
  result: Record<string, unknown> | null;
  error: string | null;
  cancel_requested: boolean;
  created_by: string | null;
  created_at: string;
  finished_at: string | null;
}

export async function enqueue(
  db: Queryable,
  job: { projectId: string | null; kind: string; payload: unknown; createdBy: string | null; idempotencyKey?: string; maxAttempts?: number },
): Promise<JobRow> {
  if (job.idempotencyKey) {
    const existing = await one<JobRow>(db, "select * from job where idempotency_key = $1", [job.idempotencyKey]);
    if (existing) return existing; // repetir o pedido não duplica a tarefa
  }
  const row = await one<JobRow>(
    db,
    `insert into job (project_id, kind, payload, created_by, idempotency_key, max_attempts)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (idempotency_key) do update set updated_at = job.updated_at
     returning *`,
    [job.projectId, job.kind, job.payload ?? {}, job.createdBy, job.idempotencyKey ?? null, job.maxAttempts ?? 3],
  );
  return row!;
}

export async function getJob(db: Queryable, projectId: string, id: string) {
  return one<JobRow>(db, "select * from job where id = $1 and project_id = $2", [id, projectId]);
}

export async function requestCancel(db: Queryable, projectId: string, id: string) {
  return one<JobRow>(
    db,
    `update job set cancel_requested = true,
            status = case when status = 'pending' then 'cancelled' else status end,
            finished_at = case when status = 'pending' then now() else finished_at end,
            updated_at = now()
      where id = $1 and project_id = $2 and status in ('pending','running') returning *`,
    [id, projectId],
  );
}

export interface JobContext {
  job: JobRow;
  pool: pg.Pool;
  progress: (p: unknown) => Promise<void>;
  isCancelled: () => Promise<boolean>;
}
export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown>>;

const WORKER_ID = `${os.hostname()}:${process.pid}`;

/** Reclama uma tarefa pendente (ou órfã há mais de 15 min) e executa-a. Devolve false se não havia trabalho. */
export async function runOnce(pool: pg.Pool, handlers: Record<string, JobHandler>): Promise<boolean> {
  const client = await pool.connect();
  let job: JobRow | undefined;
  try {
    await client.query("begin");
    job = (
      await client.query<JobRow>(
        `select * from job
          where (status = 'pending' and run_after <= now())
             or (status = 'running' and locked_at < now() - interval '15 minutes')
          order by created_at
          for update skip locked
          limit 1`,
      )
    ).rows[0];
    if (job) {
      await client.query(
        "update job set status = 'running', attempts = attempts + 1, locked_at = now(), locked_by = $2, updated_at = now() where id = $1",
        [job.id, WORKER_ID],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  if (!job) return false;
  const handler = handlers[job.kind];
  const ctx: JobContext = {
    job,
    pool,
    progress: async (p) => {
      await q(pool, "update job set progress = $2, locked_at = now(), updated_at = now() where id = $1", [job!.id, p]);
    },
    isCancelled: async () => !!(await one<{ c: boolean }>(pool, "select cancel_requested as c from job where id = $1", [job!.id]))?.c,
  };
  try {
    if (!handler) throw new Error(`Tipo de tarefa desconhecido: ${job.kind}`);
    const result = await handler(ctx);
    if (await ctx.isCancelled()) {
      await q(pool, "update job set status = 'cancelled', finished_at = now(), updated_at = now() where id = $1", [job.id]);
    } else {
      await q(pool, "update job set status = 'succeeded', result = $2, error = null, finished_at = now(), updated_at = now() where id = $1", [
        job.id,
        result,
      ]);
    }
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 2000) ?? String(e);
    const attempts = job.attempts + 1;
    if (attempts >= job.max_attempts || !handler) {
      await q(pool, "update job set status = 'failed', error = $2, finished_at = now(), updated_at = now() where id = $1", [job.id, msg]);
    } else {
      await q(
        pool,
        `update job set status = 'pending', error = $2, run_after = now() + ($3 || ' seconds')::interval, locked_at = null, updated_at = now()
          where id = $1`,
        [job.id, msg, String(2 ** attempts * 5)],
      );
    }
  }
  return true;
}

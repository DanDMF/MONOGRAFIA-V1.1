// Composição do processo: armazenamento, handlers da fila, ciclo do worker e provisionamento inicial opcional.
import type pg from "pg";
import type { AppConfig } from "../config.js";
import { one, q, tx } from "../db/pool.js";
import { DbStorage, LocalStorage, type Storage } from "./storage.js";
import { hashPassword, validatePasswordStrength } from "../auth/passwords.js";
import { runOnce, type JobHandler } from "../modules/jobs/queue.js";
import { documentJobHandler, exportJobHandler } from "../http/routes-data.js";
import { createProjectFor } from "../http/routes-project.js";

export function createStorage(config: AppConfig, pool: pg.Pool): Storage {
  return process.env.STORAGE_DRIVER === "db" ? new DbStorage(pool) : new LocalStorage(config.storageDir);
}

export function jobHandlers(ctx: { pool: pg.Pool; config: AppConfig; storage: Storage }): Record<string, JobHandler> {
  return {
    "export.xlsx": exportJobHandler(ctx) as unknown as JobHandler,
    "export.document": documentJobHandler(ctx) as unknown as JobHandler,
  };
}

/** Ciclo do worker; termina quando shouldStop() devolve true. */
export async function workerLoop(pool: pg.Pool, handlers: Record<string, JobHandler>, shouldStop: () => boolean) {
  while (!shouldStop()) {
    try {
      const worked = await runOnce(pool, handlers);
      if (!worked) await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error("Erro no worker:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * Provisionamento inicial para alojamentos sem terminal. Só atua se a base NÃO tiver nenhuma conta:
 * cria o autor e o projeto a partir de VRBAN_BOOTSTRAP_* (a palavra-passe vem do ambiente, nunca do código).
 * Depois da primeira conta criada, estas variáveis são ignoradas (podem e devem ser apagadas).
 */
export async function bootstrapAuthor(pool: pg.Pool, log: (m: string) => void = console.log) {
  const email = process.env.VRBAN_BOOTSTRAP_EMAIL?.trim();
  const password = process.env.VRBAN_BOOTSTRAP_PASSWORD;
  if (!email || !password) return "skipped";
  const n = await one<{ n: number }>(pool, "select count(*)::int as n from app_user");
  if ((n?.n ?? 0) > 0) {
    log("Provisionamento inicial ignorado: já existem contas. Pode remover VRBAN_BOOTSTRAP_PASSWORD do ambiente.");
    return "ignored";
  }
  const weak = validatePasswordStrength(password);
  if (weak) {
    log(`Provisionamento inicial recusado: ${weak}`);
    return "refused";
  }
  const name = process.env.VRBAN_BOOTSTRAP_NAME?.trim() || email;
  const slug = (process.env.VRBAN_BOOTSTRAP_PROJECT ?? "vrban").trim().toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
    log("Provisionamento inicial recusado: VRBAN_BOOTSTRAP_PROJECT deve ter minúsculas, números e hífens.");
    return "refused";
  }
  await tx(pool, async (c) => {
    const u = await one<{ id: string }>(c, "insert into app_user (email, display_name, password_hash) values ($1,$2,$3) returning id", [
      email,
      name,
      await hashPassword(password),
    ]);
    const existing = await one<{ id: string }>(c, "select id from project where slug = $1", [slug]);
    if (existing) await q(c, "insert into project_member (project_id, user_id, role, granted_by) values ($1,$2,'author',$2)", [existing.id, u!.id]);
    else await createProjectFor(c, u!.id, { slug, name: "VRBAN", authorName: name, template: "empirical_monograph" });
  });
  log(`Provisionamento inicial: autor ${email} criado no projeto "${slug}".`);
  return "created";
}

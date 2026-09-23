import type { FastifyReply, FastifyRequest } from "fastify";
import type pg from "pg";
import type { AppConfig } from "../config.js";
import type { Storage } from "../lib/storage.js";
import type { SessionUser } from "../auth/sessions.js";
import { one } from "../db/pool.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { parse, uuid } from "../lib/validate.js";

export interface AppCtx {
  pool: pg.Pool;
  config: AppConfig;
  storage: Storage;
}

declare module "fastify" {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export type Role = "author" | "reviewer";

export function requireUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/**
 * Autorização no servidor para todas as operações de projeto.
 * "write": apenas papel author. "read": author ou reviewer (revisor: consulta/comentário, nunca publicação).
 */
export async function requireProject(
  ctx: AppCtx,
  req: FastifyRequest,
  need: "read" | "write",
): Promise<{ user: SessionUser; projectId: string; role: Role }> {
  const user = requireUser(req);
  const projectId = parse(uuid, (req.params as { projectId?: string }).projectId);
  const m = await one<{ role: Role }>(
    ctx.pool,
    "select role from project_member where project_id = $1 and user_id = $2 and revoked_at is null",
    [projectId, user.id],
  );
  if (!m) throw forbidden("Esta conta não está autorizada neste projeto.");
  if (need === "write" && m.role !== "author") throw forbidden("Apenas o autor pode alterar este conteúdo.");
  return { user, projectId, role: m.role };
}

export const ok = (reply: FastifyReply, data: unknown, status = 200) => reply.code(status).send(data);

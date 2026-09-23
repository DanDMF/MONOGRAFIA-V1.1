import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { one, q, tx } from "../db/pool.js";
import { badRequest, notFound } from "../lib/errors.js";
import { parse, uuid } from "../lib/validate.js";
import { safeFileName } from "../lib/storage.js";
import { audit } from "../lib/audit.js";
import { isEntityName, type EntityName } from "../../shared/entities.js";
import {
  createEntity,
  deleteAllocation,
  getEntity,
  history,
  listEntities,
  setArchived,
  updateEntity,
} from "../modules/entities/service.js";
import { computeProjectIndicators } from "../modules/analysis/indicators-service.js";
import { breakEven } from "../modules/analysis/calc.js";
import { buildResearchWorkbook, excelExportSchema, toCsv } from "../modules/exports/excel.js";
import { enqueue, getJob, requestCancel } from "../modules/jobs/queue.js";
import { dependentsOf } from "../modules/analysis/dependencies.js";
import {
  createPublication,
  listPublications,
  publicOverview,
  publicSection,
  setCurrentPublication,
  withdrawPublication,
} from "../modules/publication/publication.js";
import { requireProject, type AppCtx } from "./context.js";

const entityParam = (req: { params: unknown }): EntityName => {
  const e = (req.params as { entity: string }).entity;
  if (!isEntityName(e)) throw notFound("Tipo de registo");
  return e;
};
const idParam = (req: { params: unknown }, key = "id") => parse(uuid, (req.params as Record<string, string>)[key]);

export function registerDataRoutes(app: FastifyInstance, ctx: AppCtx) {
  // ---------- Entidades genéricas (experimento, finanças, excertos...) ----------
  app.get("/api/projects/:projectId/e/:entity", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { archived, limit, offset, ...filters } = req.query as Record<string, string>;
    return listEntities(ctx.pool, entityParam(req), projectId, {
      filters,
      includeArchived: archived === "true",
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  });
  app.get("/api/projects/:projectId/e/:entity/:id", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return getEntity(ctx.pool, entityParam(req), projectId, idParam(req));
  });
  app.post("/api/projects/:projectId/e/:entity", async (req, reply) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const name = entityParam(req);
    return reply.code(201).send(await tx(ctx.pool, (c) => createEntity(c, name, projectId, user.id, req.body)));
  });
  app.patch("/api/projects/:projectId/e/:entity/:id", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const name = entityParam(req);
    return tx(ctx.pool, (c) => updateEntity(c, name, projectId, user.id, idParam(req), req.body));
  });
  app.post("/api/projects/:projectId/e/:entity/:id/archive", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
    return setArchived(ctx.pool, entityParam(req), projectId, user.id, idParam(req), archived);
  });
  app.delete("/api/projects/:projectId/e/allocation/:id", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    await deleteAllocation(ctx.pool, projectId, user.id, idParam(req));
    return { ok: true };
  });
  app.get("/api/projects/:projectId/e/:entity/:id/history", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return history(ctx.pool, projectId, entityParam(req), idParam(req));
  });
  /** "Onde é utilizado?" / "O que muda se eu o corrigir?" */
  app.get("/api/projects/:projectId/e/:entity/:id/dependents", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return dependentsOf(ctx.pool, projectId, entityParam(req), idParam(req));
  });

  // ---------- Indicadores ----------
  app.get("/api/projects/:projectId/indicators", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { cycleIds } = parse(z.object({ cycleIds: z.string().optional() }), req.query);
    const ids = cycleIds ? cycleIds.split(",").map((x) => parse(uuid, x)) : undefined;
    const r = await computeProjectIndicators(ctx.pool, projectId, ids);
    return { formulaVersion: r.formulaVersion, computedAt: r.computedAt, perCycle: r.perCycle.map(({ cycle, results }) => ({ cycle, results })), aggregate: r.aggregate, unallocated: r.unallocated };
  });
  app.post("/api/projects/:projectId/indicators/break-even", async (req) => {
    await requireProject(ctx, req, "read");
    const b = parse(
      z.object({
        fixedCosts: z.string().regex(/^\d+(\.\d+)?$/),
        unitPrice: z.string().regex(/^\d+(\.\d+)?$/),
        unitVariableCost: z.string().regex(/^\d+(\.\d+)?$/),
        unit: z.string().max(20).default("kg"),
      }),
      req.body,
    );
    return breakEven(b.fixedCosts, b.unitPrice, b.unitVariableCost, b.unit);
  });

  // ---------- Exportações ----------
  /** Resumo do escopo antes de gerar (linhas por folha, filtros, privacidade). */
  app.post("/api/projects/:projectId/exports/xlsx/preview", async (req) => {
    const { projectId } = await requireProject(ctx, req, "write");
    const { summary } = await buildResearchWorkbook(ctx.pool, projectId, req.body);
    return summary;
  });
  /** Geração em segundo plano (fila persistente); o pedido repetido com a mesma chave não duplica. */
  app.post("/api/projects/:projectId/exports/xlsx", async (req, reply) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const options = parse(excelExportSchema, req.body ?? {});
    const key = (req.headers["idempotency-key"] as string | undefined)?.slice(0, 100);
    const job = await enqueue(ctx.pool, {
      projectId,
      kind: "export.xlsx",
      payload: { options, userId: user.id },
      createdBy: user.id,
      idempotencyKey: key ? `${projectId}:${key}` : undefined,
    });
    return reply.code(202).send(job);
  });
  /** CSV da tabela atual (filtros aplicados no cliente são reenviados como linhas de IDs). */
  app.post("/api/projects/:projectId/exports/csv/:entity", async (req, reply) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const name = entityParam(req);
    const b = parse(z.object({ ids: z.array(uuid).optional(), columns: z.array(z.string().max(64)).optional(), excelCompat: z.boolean().default(true) }), req.body ?? {});
    const { rows } = await listEntities(ctx.pool, name, projectId, { limit: 5000 });
    const selected = b.ids ? rows.filter((r) => b.ids!.includes(String(r.id))) : rows;
    const { ENTITIES } = await import("../../shared/entities.js");
    const def = ENTITIES[name];
    const cols = ["id", ...Object.keys(def.fields).filter((k) => !def.fields[k]!.private && (!b.columns || b.columns.includes(k)))];
    const csv = toCsv(
      cols.map((c) => (c === "id" ? "ID" : def.fields[c]!.label + (def.fields[c]!.unit ? ` (${def.fields[c]!.unit})` : ""))),
      selected.map((r) => cols.map((c) => r[c] ?? null)),
      { sep: b.excelCompat ? ";" : ",", bom: true },
    );
    await audit(ctx.pool, { projectId, userId: user.id, action: "export", entityType: "csv", summary: `${name}: ${selected.length} linhas` });
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="${safeFileName(def.labelPlural)}.csv"`);
    return csv;
  });
  app.get("/api/projects/:projectId/jobs", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return q(
      ctx.pool,
      "select id, kind, status, attempts, max_attempts, progress, result, error, created_at, finished_at from job where project_id = $1 order by created_at desc limit 50",
      [projectId],
    );
  });
  app.get("/api/projects/:projectId/jobs/:id", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const j = await getJob(ctx.pool, projectId, idParam(req));
    if (!j) throw notFound("Tarefa");
    return j;
  });
  app.post("/api/projects/:projectId/jobs/:id/cancel", async (req) => {
    const { projectId } = await requireProject(ctx, req, "write");
    const j = await requestCancel(ctx.pool, projectId, idParam(req));
    if (!j) throw badRequest("A tarefa já terminou.");
    return j;
  });

  // ---------- Ficheiros (download autenticado, validade limitada para exportações) ----------
  app.get("/api/projects/:projectId/files/:id", async (req, reply) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const f = await one<{ storage_key: string; original_name: string; content_type: string; expires_at: string | null }>(
      ctx.pool,
      "select storage_key, original_name, content_type, expires_at from stored_file where id = $1 and project_id = $2",
      [idParam(req), projectId],
    );
    if (!f) throw notFound("Ficheiro");
    if (f.expires_at && new Date(f.expires_at) < new Date()) throw notFound("Ficheiro (expirado — gere novamente)");
    const buf = await ctx.storage.get(f.storage_key);
    reply.header("content-type", f.content_type);
    reply.header("content-disposition", `attachment; filename="${safeFileName(f.original_name)}"`);
    reply.header("cache-control", "private, no-store");
    return reply.send(buf);
  });

  // ---------- Publicação ----------
  app.get("/api/projects/:projectId/publications", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return listPublications(ctx.pool, projectId);
  });
  app.post("/api/projects/:projectId/publications", async (req, reply) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return reply.code(201).send(await tx(ctx.pool, (c) => createPublication(c, projectId, user.id, req.body)));
  });
  app.post("/api/projects/:projectId/publications/:id/withdraw", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    await tx(ctx.pool, (c) => withdrawPublication(c, projectId, user.id, idParam(req)));
    return { ok: true };
  });
  app.post("/api/projects/:projectId/publications/:id/current", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    await setCurrentPublication(ctx.pool, projectId, user.id, idParam(req));
    return { ok: true };
  });

  // ---------- Área pública (só snapshots publicados) ----------
  const pubNum = (req: { params: unknown }) => {
    const v = (req.params as { number?: string }).number;
    return v ? parse(z.coerce.number().int().min(1), v) : undefined;
  };
  const slugParam = (req: { params: unknown }) => parse(z.string().regex(/^[a-z0-9-]+$/), (req.params as { slug: string }).slug);
  /** Projeto apresentado em "/": PUBLIC_PROJECT_SLUG, ou o único projeto com publicação ativa. */
  app.get("/api/public-config", async () => {
    if (process.env.PUBLIC_PROJECT_SLUG) return { slug: process.env.PUBLIC_PROJECT_SLUG };
    const rows = await q<{ slug: string }>(ctx.pool, "select slug from project where current_publication_id is not null and not is_demo limit 2");
    return { slug: rows.length === 1 ? rows[0]!.slug : null };
  });
  app.get("/api/public/:slug", async (req) => publicOverview(ctx.pool, slugParam(req), ctx.config.publicBaseUrl));
  app.get("/api/public/:slug/v/:number", async (req) => publicOverview(ctx.pool, slugParam(req), ctx.config.publicBaseUrl, pubNum(req)));
  app.get("/api/public/:slug/sections/:id", async (req) => publicSection(ctx.pool, slugParam(req), idParam(req)));
  app.get("/api/public/:slug/v/:number/sections/:id", async (req) => publicSection(ctx.pool, slugParam(req), idParam(req), pubNum(req)));
}

/** Handler da fila: gera o XLSX, guarda no armazenamento com validade e devolve o ID do ficheiro. */
export function exportJobHandler(ctx: AppCtx) {
  return async ({ job, progress }: { job: { id: string; project_id: string | null; payload: Record<string, unknown> }; progress: (p: unknown) => Promise<void> }) => {
    const projectId = job.project_id!;
    await progress({ step: "a gerar" });
    const { buffer, summary, fileName } = await buildResearchWorkbook(ctx.pool, projectId, job.payload.options);
    const sha = crypto.createHash("sha256").update(buffer).digest("hex");
    const key = `projects/${projectId}/exports/${job.id}.xlsx`; // determinístico: repetir não duplica
    await ctx.storage.put(key, buffer);
    const file = await one<{ id: string }>(
      ctx.pool,
      `insert into stored_file (project_id, storage_key, original_name, content_type, size_bytes, sha256, purpose, expires_at, created_by)
       values ($1,$2,$3,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$4,$5,'export', now() + interval '7 days', $6)
       on conflict (storage_key) do update set size_bytes = excluded.size_bytes, sha256 = excluded.sha256
       returning id`,
      [projectId, key, fileName, buffer.length, sha, job.payload.userId ?? null],
    );
    await audit(ctx.pool, {
      projectId,
      userId: (job.payload.userId as string) ?? null,
      action: "export",
      entityType: "xlsx",
      entityId: file!.id,
      summary: `${fileName} (${summary.scope})`,
      after: summary,
    });
    return { fileId: file!.id, fileName, summary, sha256: sha, size: buffer.length };
  };
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { tx } from "../db/pool.js";
import { parse, uuid } from "../lib/validate.js";
import { createCard, getCard, integrateCard, listCards, setCardArchived, updateCard } from "../modules/writing/cards.js";
import { requireProject, type AppCtx } from "./context.js";

const idParam = (req: { params: unknown }) => parse(uuid, (req.params as Record<string, string>).id);

/** Próximo parágrafo (secção 12). */
export function registerWritingRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.get("/api/projects/:projectId/cards", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { archived } = parse(z.object({ archived: z.enum(["true", "false"]).optional() }), req.query);
    return listCards(ctx.pool, projectId, archived === "true");
  });
  app.post("/api/projects/:projectId/cards", async (req, reply) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return reply.code(201).send(await createCard(ctx.pool, projectId, user.id, req.body));
  });
  app.get("/api/projects/:projectId/cards/:id", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return getCard(ctx.pool, projectId, idParam(req));
  });
  app.patch("/api/projects/:projectId/cards/:id", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return tx(ctx.pool, (c) => updateCard(c, projectId, user.id, idParam(req), req.body));
  });
  app.post("/api/projects/:projectId/cards/:id/integrate", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return tx(ctx.pool, (c) => integrateCard(c, projectId, user.id, idParam(req), req.body));
  });
  app.post("/api/projects/:projectId/cards/:id/archive", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
    await setCardArchived(ctx.pool, projectId, user.id, idParam(req), archived);
    return { ok: true };
  });
}

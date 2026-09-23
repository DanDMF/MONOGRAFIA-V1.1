import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import type pg from "pg";
import type { AppConfig } from "./config.js";
import type { Storage } from "./lib/storage.js";
import { AppError } from "./lib/errors.js";
import { resolveSession, SESSION_COOKIE } from "./auth/sessions.js";
import type { AppCtx } from "./http/context.js";
import { registerAuthRoutes } from "./http/routes-auth.js";
import { registerProjectRoutes } from "./http/routes-project.js";
import { registerContentRoutes } from "./http/routes-content.js";
import { registerDataRoutes } from "./http/routes-data.js";
import { registerWritingRoutes } from "./http/routes-writing.js";
import { ENTITIES } from "../shared/entities.js";
import { styleInfo } from "./modules/bibliography/csl.js";
import { FORMULA_VERSION } from "./modules/analysis/calc.js";

export async function buildApp(opts: { config: AppConfig; pool: pg.Pool; storage: Storage; logger?: boolean }): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ? { level: "info", redact: ["req.headers.cookie", "req.headers.authorization"] } : false,
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: opts.config.production,
  });
  const ctx: AppCtx = { pool: opts.pool, config: opts.config, storage: opts.storage };

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (req) => {
    req.user = await resolveSession(ctx.pool, req.cookies[SESSION_COOKIE]);
  });
  // Proteção CSRF: pedidos que alteram estado exigem cabeçalho próprio (força pré-verificação CORS).
  app.addHook("preHandler", async (req) => {
    if (req.url.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers["x-requested-with"] !== "vrban") throw new AppError(403, "csrf", "Pedido recusado (cabeçalho de origem em falta).");
    }
  });
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "same-origin");
    reply.header("x-frame-options", "DENY");
    return payload;
  });

  app.setErrorHandler((err: Error & { code?: string; statusCode?: number; detail?: string }, req, reply) => {
    if (err instanceof AppError) return reply.code(err.status).send({ error: err.code, message: err.message, details: err.details });
    // Erros PostgreSQL conhecidos → mensagens compreensíveis
    if (err.code === "23505") return reply.code(409).send({ error: "duplicate", message: "Já existe um registo com esses dados únicos." });
    if (err.code === "23503") return reply.code(409).send({ error: "in_use", message: "Registo relacionado inexistente ou ainda em uso por outros registos." });
    if (err.code === "23514") return reply.code(400).send({ error: "check", message: err.message.includes("excede") ? err.message : "Valor fora das regras permitidas." });
    if (err.code === "22P02") return reply.code(400).send({ error: "invalid", message: "Valor com formato inválido." });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: "request", message: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: "internal", message: "Erro interno. O pedido não foi concluído; os dados anteriores mantêm-se." });
  });

  app.get("/api/health", async () => {
    await opts.pool.query("select 1");
    return { ok: true, storage: opts.storage.describe(), csl: styleInfo(), formulaVersion: FORMULA_VERSION };
  });
  app.get("/api/meta/entities", async () => ENTITIES);

  registerAuthRoutes(app, ctx);
  registerProjectRoutes(app, ctx);
  registerContentRoutes(app, ctx);
  registerDataRoutes(app, ctx);
  registerWritingRoutes(app, ctx);

  // Em produção, servir o cliente compilado com fallback SPA.
  const clientDir = path.resolve("dist/client");
  if (fs.existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not_found", message: "Rota inexistente." });
      return reply.sendFile("index.html");
    });
  }
  return app;
}

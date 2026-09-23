import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { one, q } from "../db/pool.js";
import { verifyPassword } from "../auth/passwords.js";
import { createSession, destroySession, SESSION_COOKIE } from "../auth/sessions.js";
import { audit } from "../lib/audit.js";
import { AppError } from "../lib/errors.js";
import { parse } from "../lib/validate.js";
import type { AppCtx } from "./context.js";

export function registerAuthRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.post("/api/auth/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const { email, password } = parse(z.object({ email: z.string().email().max(300), password: z.string().min(1).max(500) }), req.body);
    const user = await one<{ id: string; password_hash: string; disabled_at: string | null }>(
      ctx.pool,
      "select id, password_hash, disabled_at from app_user where lower(email) = lower($1)",
      [email],
    );
    // Mensagem única para não revelar se a conta existe.
    const valid = user && !user.disabled_at && (await verifyPassword(user.password_hash, password));
    if (!user || !valid) throw new AppError(401, "invalid_credentials", "Email ou palavra-passe incorretos.");
    const token = await createSession(ctx.pool, user.id, ctx.config.sessionTtlHours, req.headers["user-agent"]);
    await audit(ctx.pool, { projectId: null, userId: user.id, action: "login", entityType: "user", entityId: user.id });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: ctx.config.production,
      path: "/",
      maxAge: ctx.config.sessionTtlHours * 3600,
    });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(ctx.pool, req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req) => {
    if (!req.user) return { user: null, projects: [] };
    const projects = await q(
      ctx.pool,
      `select p.id, p.slug, p.name, p.academic_title, p.is_demo, m.role
         from project_member m join project p on p.id = m.project_id
        where m.user_id = $1 and m.revoked_at is null order by p.created_at`,
      [req.user.id],
    );
    return { user: req.user, projects };
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { one, q, tx } from "../db/pool.js";
import { audit } from "../lib/audit.js";
import { conflict } from "../lib/errors.js";
import { emptyToNull, parse } from "../lib/validate.js";
import { applyTemplate, listSections } from "../modules/content/sections.js";
import { runAcademicAudit } from "../modules/audit/academic.js";
import { nextCard } from "../modules/writing/cards.js";
import { requireProject, requireUser, type AppCtx } from "./context.js";

const optText = (max = 1000) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();

export const projectSettingsSchema = z.object({
  version: z.number().int(),
  name: z.string().trim().min(1).max(200).optional(),
  academic_title: optText(500),
  author_name: optText(200),
  author_family: optText(200),
  author_given: optText(200),
  degree: optText(200),
  institution: optText(300),
  advisor: optText(300),
  academic_year: optText(50),
  study_status: z.string().trim().min(1).max(200).optional(),
  citation_locale: z.enum(["pt-PT", "en-US"]).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  default_currency: z.string().trim().length(3).transform((s) => s.toUpperCase()).optional(),
  public_summary: optText(10000),
  central_question: optText(2000),
});

export async function createProjectFor(
  db: Parameters<typeof applyTemplate>[0],
  userId: string,
  input: { slug: string; name: string; academicTitle?: string | null; authorName?: string | null; template?: string; isDemo?: boolean },
) {
  const p = await one<{ id: string }>(
    db,
    `insert into project (slug, name, academic_title, author_name, is_demo) values ($1,$2,$3,$4,$5) returning id`,
    [input.slug, input.name, input.academicTitle ?? null, input.authorName ?? null, input.isDemo ?? false],
  );
  await q(db, "insert into project_member (project_id, user_id, role, granted_by) values ($1,$2,'author',$2)", [p!.id, userId]);
  if (input.template) await applyTemplate(db, p!.id, input.template);
  await audit(db, { projectId: p!.id, userId, action: "create", entityType: "project", entityId: p!.id });
  return p!.id;
}

export function registerProjectRoutes(app: FastifyInstance, ctx: AppCtx) {
  app.post("/api/projects", async (req, reply) => {
    const user = requireUser(req);
    const body = parse(
      z.object({
        slug: z.string().regex(/^[a-z0-9-]{2,60}$/, "Use minúsculas, números e hífens."),
        name: z.string().trim().min(1).max(200),
        academicTitle: optText(500),
        authorName: optText(200),
        template: z.enum(["empirical_monograph", "custom"]).default("empirical_monograph"),
      }),
      req.body,
    );
    const exists = await one(ctx.pool, "select 1 from project where slug = $1", [body.slug]);
    if (exists) throw conflict("Já existe um projeto com esse identificador.");
    const id = await tx(ctx.pool, (c) => createProjectFor(c, user.id, body));
    return reply.code(201).send({ id });
  });

  app.get("/api/projects/:projectId", async (req) => {
    const { projectId, role } = await requireProject(ctx, req, "read");
    const p = await one(ctx.pool, "select * from project where id = $1", [projectId]);
    return { project: p, role };
  });

  app.patch("/api/projects/:projectId", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const { version, ...data } = parse(projectSettingsSchema, req.body);
    const before = await one(ctx.pool, "select * from project where id = $1", [projectId]);
    const cols = Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined);
    const row = await one(
      ctx.pool,
      `update project set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}${cols.length ? "," : ""} version = version + 1, updated_at = now()
        where id = $1 and version = $2 returning *`,
      [projectId, version, ...cols.map((c) => (data as Record<string, unknown>)[c])],
    );
    if (!row) throw conflict("O projeto foi alterado noutra sessão. Recarregue.");
    await audit(ctx.pool, { projectId, userId: user.id, action: "update", entityType: "project", entityId: projectId, before, after: row });
    return { project: row };
  });

  /** Painel: próximas ações concretas a partir do estado real (secção 58). */
  app.get("/api/projects/:projectId/dashboard", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const sections = await listSections(ctx.pool, projectId);
    const counts = await one<Record<string, number>>(
      ctx.pool,
      `select
        (select count(*) from reference where project_id = $1 and archived_at is null)::int as references,
        (select count(*) from reference where project_id = $1 and archived_at is null and verification_status = 'unverified')::int as unverified_references,
        (select count(*) from reference r where r.project_id = $1 and r.archived_at is null
            and not exists (select 1 from citation_item ci where ci.reference_id = r.id))::int as uncited_references,
        (select count(*) from cycle where project_id = $1 and archived_at is null)::int as cycles,
        (select count(*) from harvest where project_id = $1 and archived_at is null)::int as harvests,
        (select count(*) from expense where project_id = $1 and archived_at is null)::int as expenses,
        (select count(*) from expense e where e.project_id = $1 and e.archived_at is null
            and not exists (select 1 from allocation a where a.expense_id = e.id))::int as unallocated_expenses,
        (select count(*) from consumption where project_id = $1 and archived_at is null and resource = 'water')::int as water_records,
        (select count(*) from publication where project_id = $1 and withdrawn_at is null)::int as publications`,
      [projectId],
    );
    const lastEdited = await one(
      ctx.pool,
      `select s.id, s.title, r.updated_at from section s join section_revision r on r.id = s.current_revision_id
        where s.project_id = $1 and s.archived_at is null order by r.updated_at desc limit 1`,
      [projectId],
    );
    const inProgress = sections.filter((s) => ["drafting", "needs_source", "in_review"].includes(s.status));
    const words = sections.filter((s) => s.include_in_word_count).reduce((a, s) => a + (s.word_count ?? 0), 0);
    const byStatus: Record<string, number> = {};
    for (const s of sections) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    const actions: { kind: string; text: string; link?: string }[] = [];
    for (const s of sections.filter((x) => x.status === "needs_source")) {
      actions.push({ kind: "source", text: `“${s.title}” precisa de fonte.`, link: `/app/escrita/editor/${s.id}` });
    }
    if (counts!.unverified_references) actions.push({ kind: "bib", text: `${counts!.unverified_references} referência(s) por confirmar na fonte.`, link: "/app/bibliografia" });
    if (counts!.unallocated_expenses) actions.push({ kind: "cost", text: `${counts!.unallocated_expenses} despesa(s) sem repartição por ciclo.`, link: "/app/dados/reparticoes" });
    if (counts!.cycles && !counts!.water_records)
      actions.push({ kind: "data", text: "Sem medições de água: o consumo de água por kg não pode ser calculado.", link: "/app/dados/consumos" });
    const auditRes = await runAcademicAudit(ctx.pool, projectId);
    if (auditRes.summary.structural)
      actions.unshift({ kind: "audit", text: `${auditRes.summary.structural} erro(s) estrutural(is) na auditoria académica.`, link: "/app/bibliografia/auditoria" });
    else if (auditRes.summary.incomplete)
      actions.push({ kind: "audit", text: `${auditRes.summary.incomplete} informação(ões) incompleta(s) na auditoria académica.`, link: "/app/bibliografia/auditoria" });
    const writing = await nextCard(ctx.pool, projectId);
    return { counts, byStatus, words, audit: auditRes.summary, writing, inProgress: inProgress.map((s) => ({ id: s.id, title: s.title, status: s.status, number: s.number })), lastEdited, actions };
  });

  app.get("/api/projects/:projectId/audit", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { limit, entityType } = parse(
      z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), entityType: z.string().max(40).optional() }),
      req.query,
    );
    return q(
      ctx.pool,
      `select a.id, a.action, a.entity_type, a.entity_id, a.summary, a.created_at, u.display_name as user_name
         from audit_event a left join app_user u on u.id = a.user_id
        where a.project_id = $1 ${entityType ? "and a.entity_type = $3" : ""}
        order by a.created_at desc, a.id desc limit $2`,
      entityType ? [projectId, limit, entityType] : [projectId, limit],
    );
  });
}

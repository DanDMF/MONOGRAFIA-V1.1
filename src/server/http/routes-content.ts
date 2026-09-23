import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { q, tx } from "../db/pool.js";
import { parse, uuid } from "../lib/validate.js";
import { badRequest } from "../lib/errors.js";
import { DocValidationError, sanitizeDoc, type CitationAttrs } from "../../shared/doc.js";
import {
  citationOccurrences,
  createSection,
  getRevision,
  getSection,
  listRevisions,
  listSections,
  moveSection,
  restoreRevision,
  saveContent,
  setSectionArchived,
  updateSectionMeta,
} from "../modules/content/sections.js";
import { loadCslItems, projectLocale, renderProjectCitations, renderSectionHtml } from "../modules/content/render.js";
import {
  createReference,
  findDuplicates,
  getReference,
  listReferences,
  mergePreview,
  mergeReferences,
  setReferenceArchived,
  updateReference,
} from "../modules/bibliography/references.js";
import { importBibliography } from "../modules/bibliography/importers.js";
import { toBibtex, toCslJson, toRis } from "../modules/bibliography/exporters.js";
import { requireProject, type AppCtx } from "./context.js";

const idParam = (req: { params: unknown }, key = "id") => parse(uuid, (req.params as Record<string, string>)[key]);

export function registerContentRoutes(app: FastifyInstance, ctx: AppCtx) {
  // ---------- Estrutura e secções ----------
  app.get("/api/projects/:projectId/sections", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { archived } = parse(z.object({ archived: z.enum(["true", "false"]).optional() }), req.query);
    return listSections(ctx.pool, projectId, archived === "true");
  });
  app.post("/api/projects/:projectId/sections", async (req, reply) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return reply.code(201).send(await createSection(ctx.pool, projectId, user.id, req.body));
  });
  app.get("/api/projects/:projectId/sections/:id", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return getSection(ctx.pool, projectId, idParam(req));
  });
  app.patch("/api/projects/:projectId/sections/:id", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return updateSectionMeta(ctx.pool, projectId, user.id, idParam(req), req.body);
  });
  app.post("/api/projects/:projectId/sections/:id/move", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    await tx(ctx.pool, (c) => moveSection(c, projectId, user.id, idParam(req), req.body));
    return listSections(ctx.pool, projectId);
  });
  app.post("/api/projects/:projectId/sections/:id/archive", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
    await setSectionArchived(ctx.pool, projectId, user.id, idParam(req), archived);
    return { ok: true };
  });
  app.put("/api/projects/:projectId/sections/:id/content", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return tx(ctx.pool, (c) => saveContent(c, projectId, user.id, idParam(req), req.body));
  });
  app.get("/api/projects/:projectId/sections/:id/revisions", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return listRevisions(ctx.pool, projectId, idParam(req));
  });
  app.get("/api/projects/:projectId/sections/:id/revisions/:revisionId", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return getRevision(ctx.pool, projectId, idParam(req), idParam(req, "revisionId"));
  });
  app.post("/api/projects/:projectId/sections/:id/revisions/:revisionId/restore", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return tx(ctx.pool, (c) => restoreRevision(c, projectId, user.id, idParam(req), idParam(req, "revisionId")));
  });
  /** Pré-visualização HTML do rascunho (privada) com citações e referências cruzadas resolvidas. */
  app.post("/api/projects/:projectId/sections/:id/preview", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { doc } = parse(z.object({ doc: z.unknown() }), req.body);
    let clean;
    try {
      clean = sanitizeDoc(doc);
    } catch (e) {
      if (e instanceof DocValidationError) throw badRequest(e.message);
      throw e;
    }
    const locale = await projectLocale(ctx.pool, projectId);
    const rendered = await renderProjectCitations(ctx.pool, projectId, { locale });
    return { html: await renderSectionHtml(ctx.pool, projectId, clean, rendered, locale) };
  });

  // ---------- Citações ----------
  /** Mapa de citações renderizadas de todo o projeto (ordem do documento, desambiguação global). */
  app.get("/api/projects/:projectId/citations/rendered", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const r = await renderProjectCitations(ctx.pool, projectId);
    return { citations: r.citations, bibliography: r.bibliography, style: r.style };
  });
  /** Pré-visualização de uma citação antes de inserir (contexto do projeto). */
  app.post("/api/projects/:projectId/citations/preview", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { citation } = parse(z.object({ citation: z.unknown() }), req.body);
    let attrs: CitationAttrs;
    try {
      const d = sanitizeDoc({ type: "doc", content: [{ type: "paragraph", content: [{ type: "citation", attrs: citation }] }] });
      attrs = d.content![0]!.content![0]!.attrs as unknown as CitationAttrs;
    } catch (e) {
      if (e instanceof DocValidationError) throw badRequest(e.message);
      throw e;
    }
    const r = await renderProjectCitations(ctx.pool, projectId, { extra: [attrs] });
    return r.citations[attrs.id];
  });
  app.get("/api/projects/:projectId/references/:id/occurrences", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return citationOccurrences(ctx.pool, projectId, idParam(req));
  });

  // ---------- Biblioteca ----------
  app.get("/api/projects/:projectId/references", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { search, archived } = parse(z.object({ search: z.string().max(200).optional(), archived: z.enum(["true", "false"]).optional() }), req.query);
    return listReferences(ctx.pool, projectId, { search, includeArchived: archived === "true" });
  });
  app.post("/api/projects/:projectId/references", async (req, reply) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return reply.code(201).send(await tx(ctx.pool, (c) => createReference(c, projectId, user.id, req.body)));
  });
  app.get("/api/projects/:projectId/references/:id", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const ref = await getReference(ctx.pool, projectId, idParam(req));
    const r = await renderProjectCitations(ctx.pool, projectId);
    return { ...ref, formatted: r.bibliography.find((b) => b.id === ref.id) ?? null };
  });
  app.put("/api/projects/:projectId/references/:id", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    return tx(ctx.pool, (c) => updateReference(c, projectId, user.id, idParam(req), req.body));
  });
  app.post("/api/projects/:projectId/references/:id/archive", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const { archived } = parse(z.object({ archived: z.boolean() }), req.body);
    await setReferenceArchived(ctx.pool, projectId, user.id, idParam(req), archived);
    return { ok: true };
  });
  app.get("/api/projects/:projectId/references-duplicates", async (req) => {
    const { projectId } = await requireProject(ctx, req, "read");
    return findDuplicates(ctx.pool, projectId);
  });
  app.post("/api/projects/:projectId/references-merge", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const b = parse(z.object({ keepId: uuid, dropId: uuid, confirm: z.boolean().default(false) }), req.body);
    if (!b.confirm) return mergePreview(ctx.pool, projectId, b.keepId, b.dropId);
    return tx(ctx.pool, (c) => mergeReferences(c, projectId, user.id, b.keepId, b.dropId));
  });
  /** Exportação bibliográfica (biblioteca inteira ou só obras citadas). */
  app.get("/api/projects/:projectId/references-export", async (req, reply) => {
    const { projectId } = await requireProject(ctx, req, "read");
    const { format, scope } = parse(z.object({ format: z.enum(["bibtex", "ris", "csl-json"]), scope: z.enum(["library", "cited"]).default("library") }), req.query);
    const ids = (
      await q<{ id: string }>(
        ctx.pool,
        scope === "cited"
          ? "select distinct r.id from reference r join citation_item ci on ci.reference_id = r.id join citation c on c.id = ci.citation_id join section s on s.id = c.section_id where r.project_id = $1 and s.archived_at is null"
          : "select id from reference where project_id = $1 and archived_at is null",
        [projectId],
      )
    ).map((r) => r.id);
    const { items } = await loadCslItems(ctx.pool, projectId, ids);
    const list = [...items.values()];
    const [body, type, ext] =
      format === "bibtex" ? [toBibtex(list), "application/x-bibtex", "bib"] : format === "ris" ? [toRis(list), "application/x-research-info-systems", "ris"] : [toCslJson(list), "application/json", "json"];
    reply.header("content-type", `${type}; charset=utf-8`);
    reply.header("content-disposition", `attachment; filename="referencias-${scope}.${ext}"`);
    return body;
  });
  /** Importação BibTeX/RIS/CSL-JSON: pré-visualização (dryRun) e confirmação. */
  app.post("/api/projects/:projectId/references-import", async (req) => {
    const { projectId, user } = await requireProject(ctx, req, "write");
    const b = parse(
      z.object({ format: z.enum(["bibtex", "ris", "csl-json"]), content: z.string().min(1).max(5_000_000), dryRun: z.boolean().default(true) }),
      req.body,
    );
    return tx(ctx.pool, (c) => importBibliography(c, projectId, user.id, b.format, b.content, b.dryRun));
  });
}

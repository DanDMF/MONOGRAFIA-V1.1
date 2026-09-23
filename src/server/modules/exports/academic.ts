// Fonte do documento académico: rascunho atual (revisões identificadas) ou uma publicação fixa.
import { z } from "zod";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { parse, uuid } from "../../lib/validate.js";
import type { DocNode, XrefAttrs } from "../../../shared/doc.js";
import { listSections } from "../content/sections.js";
import { projectLocale, renderProjectCitations } from "../content/render.js";
import type { AcademicDocInput, AcademicSection } from "./docx.js";

export const documentExportSchema = z.object({
  source: z.enum(["draft", "publication"]).default("draft"),
  publicationNumber: z.number().int().min(1).optional(),
  sectionIds: z.array(uuid).optional(),
  format: z.enum(["docx", "pdf"]).default("docx"),
  titlePage: z.boolean().default(true),
  toc: z.boolean().default(true),
  numberHeadings: z.boolean().default(true),
});
export type DocumentExportOptions = z.infer<typeof documentExportSchema>;

const WORDS = {
  "pt-PT": { chapter: "Capítulo", section: "Secção", appendix: "Apêndice" },
  "en-US": { chapter: "Chapter", section: "Section", appendix: "Appendix" },
};

function xrefFrom(sections: { id: string; number: string | null; title: string; kind: string }[], locale: "pt-PT" | "en-US") {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const w = WORDS[locale];
  return (x: XrefAttrs) => {
    const s = byId.get(x.targetId);
    if (!s) return null;
    const word = s.kind === "chapter" ? w.chapter : s.kind === "appendix" ? w.appendix : w.section;
    return s.number ? `${word} ${s.number}` : `“${s.title}”`;
  };
}

export async function academicSource(db: Queryable, projectId: string, raw: unknown): Promise<{ input: AcademicDocInput; options: DocumentExportOptions; manifest: Record<string, unknown> }> {
  const opt = parse(documentExportSchema, raw ?? {});
  const project = await one<Record<string, string | null>>(db, "select * from project where id = $1", [projectId]);
  if (!project) throw notFound("Projeto");
  const options = { titlePage: opt.titlePage, toc: opt.toc, numberHeadings: opt.numberHeadings };
  const projectInfo = {
    name: project.name!,
    academic_title: project.academic_title ?? null,
    author_name: project.author_name ?? null,
    institution: project.institution ?? null,
    degree: project.degree ?? null,
    advisor: project.advisor ?? null,
    academic_year: project.academic_year ?? null,
  };

  if (opt.source === "publication") {
    if (!opt.publicationNumber) throw badRequest("Indique o número da publicação.");
    const pub = await one<{ id: string; label: string; created_at: string; withdrawn_at: string | null }>(
      db,
      "select id, label, created_at, withdrawn_at from publication where project_id = $1 and number = $2",
      [projectId, opt.publicationNumber],
    );
    if (!pub) throw notFound("Publicação");
    const items = await q<{ item_type: string; content: any }>(
      db,
      "select item_type, content from publication_item where publication_id = $1 order by position",
      [pub.id],
    );
    const secs = items.filter((i) => i.item_type === "section").map((i) => i.content);
    if (secs.some((s) => s.html && s.doc === undefined)) {
      throw badRequest("Esta versão foi publicada antes de o documento estruturado ser guardado no snapshot. Publique uma nova versão para a exportar.");
    }
    const bib = items.find((i) => i.item_type === "bibliography")?.content ?? { entries: [], citations: {}, locale: "pt-PT" };
    const locale = (bib.locale ?? "pt-PT") as "pt-PT" | "en-US";
    const sections: AcademicSection[] = secs.map((s) => ({ id: s.id, number: s.number, title: s.title, kind: s.kind, depth: s.depth, template_key: s.template_key, doc: s.doc ?? null }));
    return {
      options: opt,
      manifest: { source: "publication", publication: pub.label, publishedAt: pub.created_at, withdrawn: !!pub.withdrawn_at },
      input: {
        locale,
        project: projectInfo,
        sections,
        citations: bib.citations ?? {},
        bibliography: bib.entries,
        xrefLabel: xrefFrom(secs, locale),
        origin: `Publicação ${pub.label} (${String(pub.created_at).slice(0, 10)})`,
        options,
      },
    };
  }

  // Rascunho atual: secções selecionadas (omissão: todas com texto) + antepassados como títulos.
  const locale = await projectLocale(db, projectId);
  const all = await listSections(db, projectId);
  const withText = all.filter((s) => (s.word_count ?? 0) > 0).map((s) => s.id);
  const selected = new Set(opt.sectionIds ?? withText);
  if (!selected.size) throw badRequest("Não há secções com texto para exportar.");
  for (const id of selected) if (!all.some((s) => s.id === id)) throw badRequest("Secção inexistente ou arquivada.");
  const byId = new Map(all.map((s) => [s.id, s]));
  const included = new Set<string>();
  for (const id of selected) {
    let cur: string | null = id;
    while (cur) {
      included.add(cur);
      cur = byId.get(cur)?.parent_id ?? null;
    }
  }
  const depth = (id: string) => {
    let d = 0;
    let cur = byId.get(id)?.parent_id ?? null;
    while (cur) {
      d++;
      cur = byId.get(cur)?.parent_id ?? null;
    }
    return d;
  };
  const rendered = await renderProjectCitations(db, projectId, { sectionIds: [...selected], locale });
  const sections: AcademicSection[] = [];
  const revisions: { section: string; revision: number }[] = [];
  for (const s of all) {
    const isRefs = s.template_key === "references";
    if (!included.has(s.id) && !isRefs) continue;
    let doc: DocNode | null = null;
    if (selected.has(s.id) && s.current_revision_id) {
      const rev = await one<{ number: number; doc: DocNode }>(db, "select number, doc from section_revision where id = $1", [s.current_revision_id]);
      if (rev) {
        doc = rev.doc;
        revisions.push({ section: s.title, revision: rev.number });
      }
    }
    sections.push({ id: s.id, number: s.number, title: s.title, kind: s.kind, depth: depth(s.id), template_key: s.template_key, doc });
  }
  const now = new Date().toISOString();
  return {
    options: opt,
    manifest: { source: "draft", generatedAt: now, revisions, style: rendered.style },
    input: {
      locale,
      project: projectInfo,
      sections,
      citations: rendered.citations,
      bibliography: rendered.bibliography,
      xrefLabel: xrefFrom(all, locale),
      origin: `rascunho de ${now.slice(0, 16).replace("T", " ")} UTC (revisões: ${revisions.map((r) => `${r.section} #${r.revision}`).join(", ")})`,
      options,
    },
  };
}

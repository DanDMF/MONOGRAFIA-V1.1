// Publicação: snapshot coerente e imutável de texto, citações renderizadas, bibliografia do escopo,
// metadados do projeto e (fase analítica) indicadores. A área pública lê só daqui.
import { z } from "zod";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { audit } from "../../lib/audit.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { parse, uuid } from "../../lib/validate.js";
import { docWordCount, type DocNode } from "../../../shared/doc.js";
import { listSections } from "../content/sections.js";
import { projectLocale, renderProjectCitations, renderSectionHtml } from "../content/render.js";
import { renderCitations, type CslItem } from "../bibliography/csl.js";
import { buildIndicatorSnapshot } from "../analysis/indicators-service.js";

export const publishSchema = z.object({
  label: z.string().trim().max(50).optional(),
  note: z.string().trim().max(5000).optional(),
  sectionIds: z.array(uuid).min(1, "Selecione pelo menos uma secção."),
  includeBibliography: z.boolean().default(true),
  includeIndicators: z.boolean().default(false),
});

export const PUBLIC_PROJECT_FIELDS = [
  "slug", "name", "academic_title", "author_name", "author_family", "author_given", "degree", "institution",
  "advisor", "academic_year", "study_status", "public_summary", "central_question", "citation_locale",
] as const;

export async function createPublication(db: Queryable, projectId: string, userId: string, body: unknown) {
  const input = parse(publishSchema, body);
  const project = await one<Record<string, unknown>>(db, "select * from project where id = $1", [projectId]);
  if (!project) throw notFound("Projeto");
  const locale = await projectLocale(db, projectId);
  const all = await listSections(db, projectId);
  const selected = new Set(input.sectionIds);
  for (const id of selected) if (!all.some((s) => s.id === id)) throw badRequest("Secção selecionada inexistente ou arquivada.");

  // Incluir antepassados (apenas título) para preservar a estrutura navegável.
  const byId = new Map(all.map((s) => [s.id, s]));
  const included = new Set<string>();
  for (const id of selected) {
    let cur: string | null = id;
    while (cur) {
      included.add(cur);
      cur = byId.get(cur)?.parent_id ?? null;
    }
  }
  const rendered = await renderProjectCitations(db, projectId, { sectionIds: [...selected], locale });
  const [{ n } = { n: 0 }] = await q<{ n: number }>(
    db,
    "select coalesce(max(number), 0)::int as n from publication where project_id = $1",
    [projectId],
  );
  const number = n + 1;
  const label = input.label || `v${number}`;

  const sectionsOut: Record<string, unknown>[] = [];
  const depth = (id: string): number => {
    let d = 0;
    let cur = byId.get(id)?.parent_id ?? null;
    while (cur) {
      d++;
      cur = byId.get(cur)?.parent_id ?? null;
    }
    return d;
  };
  for (const s of all) {
    if (!included.has(s.id)) continue;
    let html: string | null = null;
    let wordCount = 0;
    let revision: { id: string; number: number } | null = null;
    let doc: DocNode | null = null;
    if (selected.has(s.id) && s.current_revision_id) {
      const rev = await one<{ id: string; number: number; doc: DocNode }>(
        db,
        "select id, number, doc from section_revision where id = $1",
        [s.current_revision_id],
      );
      if (rev) {
        html = await renderSectionHtml(db, projectId, rev.doc, rendered, locale, (sid) =>
          included.has(sid) && selected.has(sid) ? `#sec-${sid}` : "",
        );
        wordCount = docWordCount(rev.doc);
        revision = { id: rev.id, number: rev.number };
        doc = rev.doc;
      }
    }
    sectionsOut.push({
      id: s.id,
      parent_id: s.parent_id,
      kind: s.kind,
      number: s.number,
      title: s.title,
      depth: depth(s.id),
      html,
      doc,
      template_key: s.template_key,
      numbered: s.numbered,
      wordCount,
      revision,
      sectionVersion: s.version,
    });
  }
  const warnings = Object.entries(rendered.citations)
    .filter(([, c]) => c.warnings.length)
    .map(([id, c]) => ({ citationId: id, warnings: c.warnings }));

  const indicators = input.includeIndicators ? await buildIndicatorSnapshot(db, projectId) : null;

  const manifest = {
    createdAt: new Date().toISOString(),
    locale,
    style: rendered.style,
    sections: sectionsOut.filter((s) => s.revision).map((s) => ({ id: s.id, revision: s.revision, sectionVersion: s.sectionVersion })),
    bibliographyCount: input.includeBibliography ? rendered.bibliography.length : 0,
    citationWarnings: warnings,
    indicators: indicators ? { formulaVersion: indicators.formulaVersion, count: indicators.results.length } : null,
  };
  const pub = await one<{ id: string; number: number; label: string; created_at: string }>(
    db,
    `insert into publication (project_id, number, label, note, manifest, created_by)
     values ($1,$2,$3,$4,$5,$6) returning id, number, label, created_at`,
    [projectId, number, label, input.note ?? null, manifest, userId],
  );
  const pid = pub!.id;
  const projectPublic = Object.fromEntries(PUBLIC_PROJECT_FIELDS.map((k) => [k, project[k] ?? null]));
  await q(db, "insert into publication_item (publication_id, item_type, item_key, content) values ($1,'project','project',$2)", [pid, projectPublic]);
  let pos = 0;
  for (const s of sectionsOut) {
    await q(
      db,
      `insert into publication_item (publication_id, item_type, item_key, position, source_id, source_version, content)
       values ($1,'section',$2,$3,$4,$5,$6)`,
      [pid, s.id, ++pos, s.id, s.sectionVersion, s],
    );
  }
  if (input.includeBibliography) {
    await q(db, "insert into publication_item (publication_id, item_type, item_key, content) values ($1,'bibliography','bibliography',$2)", [
      pid,
      { entries: rendered.bibliography, style: rendered.style, locale, citations: rendered.citations },
    ]);
  }
  if (indicators) {
    await q(db, "insert into publication_item (publication_id, item_type, item_key, content) values ($1,'indicators','indicators',$2)", [
      pid,
      indicators,
    ]);
  }
  await q(db, "update project set current_publication_id = $2, updated_at = now() where id = $1", [projectId, pid]);
  await audit(db, { projectId, userId, action: "publish", entityType: "publication", entityId: pid, summary: `${label}: ${input.note ?? ""}`, after: manifest });
  return { ...pub!, manifest };
}

export async function listPublications(db: Queryable, projectId: string) {
  return q(
    db,
    `select p.id, p.number, p.label, p.note, p.created_at, p.withdrawn_at, p.manifest,
            (p.id = pr.current_publication_id) as is_current
       from publication p join project pr on pr.id = p.project_id
      where p.project_id = $1 order by p.number desc`,
    [projectId],
  );
}

/** Retira uma versão: deixa de ser servida em rotas e pesquisas públicas. */
export async function withdrawPublication(db: Queryable, projectId: string, userId: string, id: string) {
  const p = await one<{ id: string }>(
    db,
    "update publication set withdrawn_at = now() where id = $1 and project_id = $2 and withdrawn_at is null returning id",
    [id, projectId],
  );
  if (!p) throw notFound("Publicação ativa");
  await q(
    db,
    `update project set current_publication_id = (
        select id from publication where project_id = $1 and withdrawn_at is null order by number desc limit 1)
      where id = $1 and current_publication_id = $2`,
    [projectId, id],
  );
  await audit(db, { projectId, userId, action: "withdraw", entityType: "publication", entityId: id });
}

export async function setCurrentPublication(db: Queryable, projectId: string, userId: string, id: string) {
  const p = await one(db, "select id from publication where id = $1 and project_id = $2 and withdrawn_at is null", [id, projectId]);
  if (!p) throw notFound("Publicação ativa");
  await q(db, "update project set current_publication_id = $2 where id = $1", [projectId, id]);
  await audit(db, { projectId, userId, action: "set_current", entityType: "publication", entityId: id });
}

// ---------------- Leitura pública (apenas snapshots não retirados) ----------------

async function resolvePublic(db: Queryable, slug: string, number?: number) {
  const row = await one<{ id: string; number: number; label: string; note: string | null; created_at: string; project_id: string }>(
    db,
    number
      ? `select p.id, p.number, p.label, p.note, p.created_at, p.project_id from publication p join project pr on pr.id = p.project_id
          where pr.slug = $1 and p.number = $2 and p.withdrawn_at is null`
      : `select p.id, p.number, p.label, p.note, p.created_at, p.project_id from publication p join project pr on pr.current_publication_id = p.id
          where pr.slug = $1 and p.withdrawn_at is null`,
    number ? [slug, number] : [slug],
  );
  if (!row) throw notFound("Publicação");
  return row;
}

export async function publicOverview(db: Queryable, slug: string, publicBaseUrl: string, number?: number) {
  const pub = await resolvePublic(db, slug, number);
  const items = await q<{ item_type: string; item_key: string; content: Record<string, unknown> }>(
    db,
    "select item_type, item_key, content from publication_item where publication_id = $1 order by item_type, position",
    [pub.id],
  );
  const project = items.find((i) => i.item_type === "project")?.content ?? {};
  const sections = items
    .filter((i) => i.item_type === "section")
    .map((i) => ({
      id: i.content.id,
      number: i.content.number,
      title: i.content.title,
      depth: i.content.depth,
      kind: i.content.kind,
      hasContent: !!i.content.html,
      wordCount: i.content.wordCount,
    }));
  const versions = await q<{ number: number; label: string; created_at: string; note: string | null }>(
    db,
    "select number, label, created_at, note from publication where project_id = $1 and withdrawn_at is null order by number desc",
    [pub.project_id],
  );
  const bib = items.find((i) => i.item_type === "bibliography")?.content ?? null;
  const bibliography = bib ? { entries: bib.entries, style: bib.style, locale: bib.locale } : null;
  const indicators = items.find((i) => i.item_type === "indicators")?.content ?? null;
  return {
    publication: { number: pub.number, label: pub.label, note: pub.note, created_at: pub.created_at },
    project,
    sections,
    bibliography,
    indicators,
    versions,
    howToCite: howToCite(project, pub, `${publicBaseUrl}/p/${slug}/v/${pub.number}`),
  };
}

export async function publicSection(db: Queryable, slug: string, sectionId: string, number?: number) {
  parse(uuid, sectionId);
  const pub = await resolvePublic(db, slug, number);
  const item = await one<{ content: Record<string, unknown> }>(
    db,
    "select content from publication_item where publication_id = $1 and item_type = 'section' and item_key = $2",
    [pub.id, sectionId],
  );
  if (!item) throw notFound("Secção publicada");
  // O documento estruturado fica no snapshot (para DOCX/PDF da versão), mas não é servido ao público.
  const { doc: _doc, ...visible } = item.content;
  return visible;
}

/** "Como citar": construído com dados reais (autor, título, data e versão da publicação, URL). Sem DOI inventado. */
export function howToCite(project: Record<string, unknown>, pub: { number: number; label: string; created_at: string }, url: string) {
  const title = String(project.academic_title || project.name || "");
  if (!title) return null;
  const author = project.author_family
    ? [{ family: String(project.author_family), given: project.author_given ? String(project.author_given) : undefined }]
    : project.author_name
      ? [{ literal: String(project.author_name) }]
      : [];
  const d = new Date(pub.created_at);
  const locale = project.citation_locale === "en-US" ? "en-US" : "pt-PT";
  const item: CslItem = {
    id: "self",
    type: "document",
    title,
    author,
    issued: { "date-parts": [[d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]] },
    version: String(pub.number),
    genre: locale === "en-US" ? "Interactive monograph" : "Monografia interativa",
    URL: url,
  };
  const out = renderCitations({
    locale,
    items: new Map([["self", item]]),
    citations: [{ id: "00000000-0000-4000-8000-000000000000", mode: "parenthetical", items: [{ referenceId: "self" }] }],
  });
  return { reference: out.bibliography[0] ?? null, inText: out.citations["00000000-0000-4000-8000-000000000000"]?.text ?? null };
}

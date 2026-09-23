import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { notFound } from "../../lib/errors.js";
import type { CitationAttrs, DocNode, XrefAttrs } from "../../../shared/doc.js";
import { docToHtml } from "../../../shared/doc.js";
import { renderCitations, type CitationLocale, type CslItem, type RenderOutput } from "../bibliography/csl.js";
import { loadContributors, toCsl } from "../bibliography/references.js";
import { listSections } from "./sections.js";

export async function projectLocale(db: Queryable, projectId: string): Promise<CitationLocale> {
  const p = await one<{ citation_locale: CitationLocale }>(db, "select citation_locale from project where id = $1", [projectId]);
  if (!p) throw notFound("Projeto");
  return p.citation_locale;
}

/** Citações pela ordem de leitura do documento (estrutura → posição na secção). */
export async function loadCitations(db: Queryable, projectId: string, sectionIds?: string[]): Promise<CitationAttrs[]> {
  const sections = await listSections(db, projectId);
  const order = new Map(sections.map((s, i) => [s.id, i]));
  const scope = sectionIds ? new Set(sectionIds) : null;
  const rows = await q<{ id: string; section_id: string; position: number; attrs: CitationAttrs }>(
    db,
    "select id, section_id, position, attrs from citation where project_id = $1",
    [projectId],
  );
  return rows
    .filter((r) => order.has(r.section_id) && (!scope || scope.has(r.section_id)))
    .sort((a, b) => order.get(a.section_id)! - order.get(b.section_id)! || a.position - b.position)
    .map((r) => r.attrs);
}

/** Carrega as fontes citadas (incluindo arquivadas, para não quebrar citações) em CSL-JSON. */
export async function loadCslItems(db: Queryable, projectId: string, referenceIds: string[]) {
  const items = new Map<string, CslItem>();
  const abbreviations = new Map<string, { literal: string; abbr: string }>();
  if (!referenceIds.length) return { items, abbreviations };
  const refs = await q<Record<string, unknown> & { id: string }>(
    db,
    "select * from reference where project_id = $1 and id = any($2::uuid[])",
    [projectId, referenceIds],
  );
  const contrib = await loadContributors(db, refs.map((r) => r.id));
  for (const r of refs) {
    const cs = contrib.get(r.id) ?? [];
    items.set(r.id, toCsl(r, cs));
    const first = cs.find((c) => c.role === "author" && c.position === 1);
    if (first?.literal && first.abbreviation) abbreviations.set(r.id, { literal: first.literal, abbr: first.abbreviation });
  }
  return { items, abbreviations };
}

export async function renderProjectCitations(
  db: Queryable,
  projectId: string,
  opts: { sectionIds?: string[]; extra?: CitationAttrs[]; locale?: CitationLocale } = {},
): Promise<RenderOutput & { ordered: CitationAttrs[] }> {
  const locale = opts.locale ?? (await projectLocale(db, projectId));
  const citations = [...(await loadCitations(db, projectId, opts.sectionIds)), ...(opts.extra ?? [])];
  const refIds = [...new Set(citations.flatMap((c) => c.items.map((i) => i.referenceId).filter(Boolean) as string[]))];
  const pcIds = [...new Set(citations.flatMap((c) => c.items.map((i) => i.personalId).filter(Boolean) as string[]))];
  const { items, abbreviations } = await loadCslItems(db, projectId, refIds);
  const personal = new Map(
    (
      await q<{ id: string; given_initials: string; family: string; communication_date: string }>(
        db,
        "select id, given_initials, family, communication_date from personal_communication where project_id = $1 and id = any($2::uuid[])",
        [projectId, pcIds],
      )
    ).map((p) => [p.id, p]),
  );
  const out = renderCitations({ locale, items, abbreviations, personal, citations });
  return { ...out, ordered: citations };
}

const XREF_WORDS = {
  "pt-PT": { chapter: "Capítulo", section: "Secção", appendix: "Apêndice" },
  "en-US": { chapter: "Chapter", section: "Section", appendix: "Appendix" },
};

/** Resolve rótulos de referências cruzadas a partir da estrutura atual (IDs estáveis). */
export async function xrefResolver(db: Queryable, projectId: string, locale: CitationLocale, hrefFor?: (sectionId: string) => string) {
  const sections = await listSections(db, projectId);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const w = XREF_WORDS[locale];
  return (x: XrefAttrs) => {
    if (x.targetType !== "section" && x.targetType !== "appendix") return undefined; // tabelas/figuras: fase de análise
    const s = byId.get(x.targetId);
    if (!s) return undefined;
    const word = s.kind === "chapter" ? w.chapter : s.kind === "appendix" ? w.appendix : w.section;
    const label = s.number ? `${word} ${s.number}` : `“${s.title}”`;
    return { label, href: hrefFor?.(s.id) };
  };
}

export async function renderSectionHtml(
  db: Queryable,
  projectId: string,
  doc: DocNode,
  rendered: RenderOutput,
  locale: CitationLocale,
  hrefFor?: (sectionId: string) => string,
) {
  const xref = await xrefResolver(db, projectId, locale, hrefFor);
  return docToHtml(doc, {
    citationHtml: (id) => rendered.citations[id]?.html,
    xrefLabel: xref,
    quoteOpen: "“",
    quoteClose: "”",
  });
}

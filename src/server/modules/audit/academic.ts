// Auditoria académica (secção 20). Classifica avisos em: erro estrutural, informação incompleta ou revisão humana.
// Permite justificar exceções. NÃO garante conformidade integral com a APA, qualidade metodológica nem ausência de plágio.
import { z } from "zod";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { audit } from "../../lib/audit.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { parse, uuid } from "../../lib/validate.js";
import { BLOCK_QUOTE_MIN_WORDS, countWords, plainText, visit, type CitationAttrs, type DocNode } from "../../../shared/doc.js";
import { listSections } from "../content/sections.js";
import { renderProjectCitations } from "../content/render.js";
import { findDuplicates, isValidDoi, listReferences, normalizeDoi } from "../bibliography/references.js";

export type Severity = "structural" | "incomplete" | "review";

export interface CheckDef {
  code: string;
  label: string;
  severity: Severity;
  guideRule: string | null; // regra do Guia APA
  applicable: boolean;
  note?: string;
}

export const CHECKS: CheckDef[] = [
  { code: "citation_unresolved", label: "Citação desligada (fonte inexistente)", severity: "structural", guideRule: "autor-data", applicable: true },
  { code: "citation_archived_source", label: "Citação de fonte arquivada", severity: "review", guideRule: null, applicable: true },
  { code: "quote_missing_locator", label: "Citação direta sem localizador", severity: "structural", guideRule: "citacao-curta", applicable: true },
  { code: "quote_short_too_long", label: "Excerto de 40 ou mais palavras em formato curto", severity: "structural", guideRule: "citacao-bloco", applicable: true },
  { code: "quote_block_too_short", label: "Citação em bloco com menos de 40 palavras", severity: "review", guideRule: "citacao-bloco", applicable: true },
  { code: "secondary_missing_author", label: "Fonte secundária sem obra original indicada", severity: "structural", guideRule: "fonte-secundaria", applicable: true },
  { code: "citation_ambiguity", label: "Ambiguidade na citação (ex.: narrativa com autores diferentes)", severity: "review", guideRule: "varias-obras", applicable: true },
  { code: "reference_duplicate", label: "Referência possivelmente duplicada", severity: "review", guideRule: "lista-referencias", applicable: true },
  { code: "reference_missing_author", label: "Referência sem autor", severity: "incomplete", guideRule: "sem-data-sem-autor", applicable: true },
  { code: "reference_missing_date", label: "Referência sem data (nem marcada como s.d.)", severity: "incomplete", guideRule: "sem-data-sem-autor", applicable: true },
  { code: "webpage_nodate_accessed", label: "Página web sem data e sem data de consulta", severity: "incomplete", guideRule: "sem-data-sem-autor", applicable: true },
  { code: "doi_malformed", label: "DOI malformado", severity: "structural", guideRule: "lista-referencias", applicable: true },
  { code: "reference_uncited", label: "Fonte da biblioteca não citada no texto", severity: "review", guideRule: "lista-referencias", applicable: true },
  { code: "heading_skipped", label: "Níveis de título saltados", severity: "structural", guideRule: "titulos", applicable: true },
  { code: "acronym_undefined", label: "Sigla sem definição na primeira utilização", severity: "review", guideRule: "siglas", applicable: true },
  { code: "section_needs_source", label: "Secção marcada como “precisa de fonte”", severity: "review", guideRule: null, applicable: true },
  { code: "institutional_required_empty", label: "Campo institucional/preliminar por preencher", severity: "incomplete", guideRule: "estrutura-institucional", applicable: true },
  {
    code: "table_figure_unmentioned",
    label: "Tabela ou figura sem menção no texto",
    severity: "structural",
    guideRule: null,
    applicable: false,
    note: "Não aplicável: tabelas e figuras ainda não existem no sistema (VRB-021-002).",
  },
];
const CHECK = new Map(CHECKS.map((c) => [c.code, c]));

export interface Finding {
  key: string;
  check: string;
  severity: Severity;
  message: string;
  target: { type: "section" | "reference" | "project" | "citation"; id: string | null; label: string; link: string | null };
  exception?: { id: string; justification: string; created_at: string; user_name: string | null } | null;
}

const ACRONYM_RE = /(?<![\p{L}\p{N}])[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,6}(?![\p{L}\p{N}])/gu;
const ROMAN = /^[IVXLCDM]+$/;
const ALWAYS_KNOWN = new Set(["APA", "DOI", "URL", "ISBN", "PDF", "AOA", "EUR", "USD", "KZ"]);

/** Siglas usadas antes de definidas (padrões aceites: "Nome por extenso (SIGLA)" ou "SIGLA (nome por extenso)"). */
export function undefinedAcronyms(texts: { sectionId: string; text: string }[], predefined: Set<string>) {
  const defined = new Set(predefined);
  const out: { acronym: string; sectionId: string; context: string }[] = [];
  const reported = new Set<string>();
  for (const { sectionId, text } of texts) {
    for (const m of text.matchAll(ACRONYM_RE)) {
      const a = m[0];
      if (ROMAN.test(a) || ALWAYS_KNOWN.has(a) || defined.has(a)) continue;
      const i = m.index ?? 0;
      const before = text.slice(Math.max(0, i - 1), i);
      const after = text.slice(i + a.length, i + a.length + 2);
      if (before === "(" && text[i + a.length] === ")") {
        defined.add(a); // "Nome por extenso (SIGLA)"
        continue;
      }
      if (/^ \(/.test(after)) {
        defined.add(a); // "SIGLA (nome por extenso)"
        continue;
      }
      if (!reported.has(a)) {
        reported.add(a);
        out.push({ acronym: a, sectionId, context: text.slice(Math.max(0, i - 40), i + a.length + 40).trim() });
      }
    }
  }
  return out;
}

/** Níveis de título saltados dentro de uma secção (o editor usa níveis 2–5). */
export function skippedHeadings(doc: DocNode) {
  const issues: { from: number; to: number; text: string }[] = [];
  let prev = 1;
  visit(doc, (n) => {
    if (n.type !== "heading") return;
    const lvl = Number(n.attrs?.level ?? 2);
    if (lvl > prev + 1) issues.push({ from: prev, to: lvl, text: plainText(n).trim() });
    prev = lvl;
  });
  return issues;
}

export async function runAcademicAudit(db: Queryable, projectId: string) {
  const project = await one<Record<string, string | null>>(db, "select * from project where id = $1", [projectId]);
  if (!project) throw notFound("Projeto");
  const sections = await listSections(db, projectId);
  const sectionLabel = new Map(sections.map((s) => [s.id, `${s.number ? s.number + " " : ""}${s.title}`]));
  const refs = await listReferences(db, projectId, { includeArchived: true });
  const refById = new Map(refs.map((r) => [r.id, r]));
  const refLabel = (r: (typeof refs)[number]) => {
    const a = r.contributors.find((c) => c.role === "author");
    return `${a ? (a.literal ?? a.family) : "Sem autor"} (${r.no_date ? "s.d." : (r.issued_year ?? "?")}) — ${r.title}`.slice(0, 120);
  };
  const rendered = await renderProjectCitations(db, projectId);
  const citeRows = await q<{ id: string; section_id: string; attrs: CitationAttrs }>(
    db,
    "select c.id, c.section_id, c.attrs from citation c join section s on s.id = c.section_id where c.project_id = $1 and s.archived_at is null",
    [projectId],
  );
  const personalIds = new Set(
    (await q<{ id: string }>(db, "select id from personal_communication where project_id = $1 and archived_at is null", [projectId])).map((r) => r.id),
  );
  const findings: Finding[] = [];
  const add = (check: string, key: string, message: string, target: Finding["target"]) =>
    findings.push({ key: `${check}:${key}`, check, severity: CHECK.get(check)!.severity, message, target });
  const secTarget = (id: string): Finding["target"] => ({ type: "section", id, label: sectionLabel.get(id) ?? "secção", link: `/app/escrita/editor/${id}` });
  const refTarget = (r: (typeof refs)[number]): Finding["target"] => ({ type: "reference", id: r.id, label: refLabel(r), link: `/app/bibliografia/${r.id}` });

  // ---- citações
  const citedRefs = new Set<string>();
  for (const c of citeRows) {
    const a = c.attrs;
    const where = secTarget(c.section_id);
    for (const it of a.items) {
      if (it.referenceId) {
        const r = refById.get(it.referenceId);
        if (!r) add("citation_unresolved", c.id, "A citação aponta para uma fonte que não existe na biblioteca.", where);
        else {
          citedRefs.add(r.id);
          if (r.archived_at) add("citation_archived_source", `${c.id}:${r.id}`, `Cita uma fonte arquivada: ${refLabel(r)}. Confirme se deve continuar a ser citada.`, where);
        }
      }
      if (it.personalId && !personalIds.has(it.personalId)) add("citation_unresolved", c.id, "A citação aponta para uma comunicação pessoal inexistente ou arquivada.", where);
    }
    const isQuote = a.mode === "quote_short" || a.mode === "quote_block";
    const text = rendered.citations[c.id]?.text ?? "";
    if (isQuote && !a.items.some((i) => i.locator)) add("quote_missing_locator", c.id, `Citação direta ${text} sem página, parágrafo, secção ou tempo.`, where);
    const words = countWords(a.quote ?? "");
    if (a.mode === "quote_short" && words >= BLOCK_QUOTE_MIN_WORDS)
      add("quote_short_too_long", c.id, `Citação curta com ${words} palavras ${text}: com 40 ou mais palavras deve ser em bloco.`, where);
    if (a.mode === "quote_block" && words > 0 && words < BLOCK_QUOTE_MIN_WORDS)
      add("quote_block_too_short", c.id, `Citação em bloco com apenas ${words} palavras ${text}: com menos de 40 palavras usa-se a forma curta.`, where);
    if (a.mode === "secondary" && !a.secondaryAuthor?.trim()) add("secondary_missing_author", c.id, `Fonte secundária ${text} sem autor da obra original.`, where);
    for (const w of rendered.citations[c.id]?.warnings ?? []) {
      if (/individualmente/.test(w)) add("citation_ambiguity", c.id, `${text}: ${w}`, where);
    }
  }

  // ---- referências
  for (const r of refs) {
    if (r.archived_at) continue;
    const hasAuthor = r.contributors.some((c) => c.role === "author" || c.role === "editor");
    if (!hasAuthor) add("reference_missing_author", r.id, "Sem autor nem editor: o título ocupará a posição do autor. Confirme se a obra não tem autor.", refTarget(r));
    if (!r.issued_year && !r.no_date) add("reference_missing_date", r.id, "Sem ano de publicação. Indique a data ou marque explicitamente “sem data (s.d.)”.", refTarget(r));
    if (r.type === "webpage" && r.no_date && !r.accessed_date)
      add("webpage_nodate_accessed", r.id, "Página sem data: a APA recomenda a data de consulta para conteúdos que mudam.", refTarget(r));
    if (r.doi && !isValidDoi(normalizeDoi(r.doi) ?? "")) add("doi_malformed", r.id, `DOI “${r.doi}” não tem o formato 10.xxxx/….`, refTarget(r));
    if (!citedRefs.has(r.id))
      add("reference_uncited", r.id, "Está na biblioteca mas não é citada: não entra na lista de referências (normal para leituras de apoio).", refTarget(r));
  }
  for (const g of await findDuplicates(db, projectId)) {
    const ids = [...g.ids].sort();
    const labels = ids.map((i) => refById.get(i)).filter(Boolean).map((r) => refLabel(r!));
    add("reference_duplicate", ids.join("+"), `${g.reason}: ${labels.join(" / ")}. Reveja e funda se forem a mesma obra.`, {
      type: "reference",
      id: ids[0]!,
      label: labels[0] ?? "",
      link: "/app/bibliografia",
    });
  }

  // ---- documento: títulos e siglas (ordem de leitura)
  const revs = await q<{ section_id: string; doc: DocNode }>(
    db,
    "select s.id as section_id, r.doc from section s join section_revision r on r.id = s.current_revision_id where s.project_id = $1 and s.archived_at is null",
    [projectId],
  );
  const docBySection = new Map(revs.map((r) => [r.section_id, r.doc]));
  const texts: { sectionId: string; text: string }[] = [];
  for (const s of sections) {
    const doc = docBySection.get(s.id);
    if (!doc) continue;
    for (const h of skippedHeadings(doc)) {
      add("heading_skipped", `${s.id}:${h.text}`, `Título “${h.text}” salta do nível ${h.from} para o nível ${h.to}.`, secTarget(s.id));
    }
    texts.push({ sectionId: s.id, text: plainText(doc) });
  }
  const predefined = new Set(
    refs.flatMap((r) => r.contributors.filter((c) => c.abbreviation && citedRefs.has(r.id)).map((c) => c.abbreviation!.toUpperCase())),
  );
  for (const u of undefinedAcronyms(texts, predefined)) {
    add("acronym_undefined", u.acronym, `A sigla “${u.acronym}” é usada sem definição prévia: “…${u.context}…”.`, secTarget(u.sectionId));
  }
  for (const s of sections.filter((x) => x.status === "needs_source")) {
    add("section_needs_source", s.id, "A secção está marcada como “precisa de fonte”.", secTarget(s.id));
  }

  // ---- institucional (até existir perfil institucional configurável)
  const INSTITUTIONAL: [string, string][] = [
    ["academic_title", "Título académico"],
    ["author_name", "Nome do autor"],
    ["institution", "Instituição"],
    ["degree", "Grau"],
    ["advisor", "Orientador"],
    ["academic_year", "Ano"],
  ];
  for (const [k, label] of INSTITUTIONAL) {
    if (!project[k]?.trim())
      add("institutional_required_empty", k, `${label} por preencher (necessário na página de título).`, { type: "project", id: null, label, link: "/app/gestao/definicoes" });
  }
  for (const key of ["abstract_pt", "abstract_en"]) {
    const s = sections.find((x) => x.template_key === key);
    if (s && !(s.word_count ?? 0)) add("institutional_required_empty", key, `“${s.title}” ainda sem texto.`, secTarget(s.id));
  }

  // ---- exceções justificadas
  const exceptions = await q<{ id: string; finding_key: string; justification: string; created_at: string; user_name: string | null }>(
    db,
    `select e.id, e.finding_key, e.justification, e.created_at, u.display_name as user_name
       from audit_exception e left join app_user u on u.id = e.created_by
      where e.project_id = $1 and e.revoked_at is null`,
    [projectId],
  );
  const exByKey = new Map(exceptions.map((e) => [e.finding_key, e]));
  for (const f of findings) {
    const e = exByKey.get(f.key);
    f.exception = e ? { id: e.id, justification: e.justification, created_at: e.created_at, user_name: e.user_name } : null;
  }
  const order: Record<Severity, number> = { structural: 0, incomplete: 1, review: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.check.localeCompare(b.check));

  const open = findings.filter((f) => !f.exception);
  const summary = {
    structural: open.filter((f) => f.severity === "structural").length,
    incomplete: open.filter((f) => f.severity === "incomplete").length,
    review: open.filter((f) => f.severity === "review").length,
    justified: findings.length - open.length,
  };
  const checks = CHECKS.map((c) => ({ ...c, count: open.filter((f) => f.check === c.code).length }));
  return {
    ranAt: new Date().toISOString(),
    disclaimer:
      "A auditoria ajuda a rever; não garante conformidade integral com a APA, qualidade metodológica nem ausência de plágio. Avisos de revisão humana podem ser legítimos e justificados.",
    summary,
    checks,
    findings,
  };
}

export const exceptionSchema = z.object({
  findingKey: z.string().min(3).max(500),
  justification: z.string().trim().min(10, "Justifique com pelo menos 10 caracteres.").max(2000),
});

export async function justifyFinding(db: Queryable, projectId: string, userId: string, body: unknown) {
  const { findingKey, justification } = parse(exceptionSchema, body);
  const current = await runAcademicAudit(db, projectId);
  const f = current.findings.find((x) => x.key === findingKey);
  if (!f) throw badRequest("Este aviso já não existe na auditoria atual.");
  if (f.exception) throw badRequest("Este aviso já tem uma justificação ativa.");
  const row = await one<{ id: string }>(
    db,
    "insert into audit_exception (project_id, finding_key, check_code, justification, created_by) values ($1,$2,$3,$4,$5) returning id",
    [projectId, findingKey, f.check, justification, userId],
  );
  await audit(db, { projectId, userId, action: "justify", entityType: "audit_exception", entityId: row!.id, summary: `${f.check}: ${justification}`, after: { findingKey, message: f.message } });
  return { id: row!.id };
}

export async function revokeException(db: Queryable, projectId: string, userId: string, id: string) {
  parse(uuid, id);
  const row = await one(db, "update audit_exception set revoked_at = now() where id = $1 and project_id = $2 and revoked_at is null returning id", [id, projectId]);
  if (!row) throw notFound("Justificação ativa");
  await audit(db, { projectId, userId, action: "revoke", entityType: "audit_exception", entityId: id });
}

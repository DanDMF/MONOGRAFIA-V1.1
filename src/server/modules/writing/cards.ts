// Próximo parágrafo (secção 12 / VRB-012-001): cartões ideia → pesquisa → leitura → notas → redação → revisão → integrado.
// A integração acrescenta o rascunho à secção de destino como parágrafo(s) com o atributo cardId e, se pedido,
// uma citação parentética das fontes do cartão (com localização). O cartão guarda a secção e a revisão.
import crypto from "node:crypto";
import { z } from "zod";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { emptyToNull, isoDate, parse, uuid } from "../../lib/validate.js";
import { LOCATOR_LABELS, type DocNode } from "../../../shared/doc.js";
import { CARD_STAGES, cardGaps } from "../../../shared/cards.js";
import { getSection, saveContent } from "../content/sections.js";

export interface CardRow {
  id: string;
  project_id: string;
  section_id: string | null;
  idea: string;
  question: string | null;
  stage: (typeof CARD_STAGES)[number];
  interpretation: string | null;
  draft: string | null;
  next_action: string | null;
  next_action_date: string | null;
  integrated_section_id: string | null;
  integrated_revision_id: string | null;
  integrated_at: string | null;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const optText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();
const WORKING_STAGES = CARD_STAGES.filter((s) => s !== "integrated") as [string, ...string[]];

const sourceSchema = z.object({
  reference_id: uuid,
  locator_label: z.preprocess(emptyToNull, z.enum(LOCATOR_LABELS).nullable()).optional(),
  locator: optText(100),
});

const createSchema = z.object({
  idea: z.string().trim().min(1, "Escreva a ideia.").max(2000),
  question: optText(2000),
  section_id: z.preprocess(emptyToNull, uuid.nullable()).optional(),
  stage: z.enum(WORKING_STAGES).default("idea"),
});

const updateSchema = z.object({
  version: z.number().int(),
  idea: z.string().trim().min(1, "A ideia não pode ficar vazia.").max(2000).optional(),
  question: optText(2000),
  section_id: z.preprocess(emptyToNull, uuid.nullable()).optional(),
  stage: z.enum(WORKING_STAGES).optional(),
  interpretation: optText(20000),
  draft: optText(20000),
  next_action: optText(1000),
  next_action_date: z.preprocess(emptyToNull, isoDate.nullable()).optional(),
  sources: z.array(sourceSchema).max(30).optional(),
  excerpt_ids: z.array(uuid).max(100).optional(),
});

// Rótulo curto de uma fonte: “Apelido (ano) — título”, só a partir dos metadados existentes.
const SOURCE_LABEL_SQL = `
  coalesce((select coalesce(c.literal, concat_ws(' ', c.particle, c.family))
              from reference_contributor c where c.reference_id = r.id and c.role = 'author' order by c.position limit 1),
           '(sem autor)') as author_label,
  r.issued_year, r.title`;

async function assertSection(db: Queryable, projectId: string, id: string | null | undefined) {
  if (!id) return;
  const s = await one(db, "select 1 from section where id = $1 and project_id = $2 and archived_at is null", [id, projectId]);
  if (!s) throw badRequest("A secção de destino não existe neste projeto.");
}

async function getRow(db: Queryable, projectId: string, id: string, lock = false): Promise<CardRow> {
  parse(uuid, id);
  const c = await one<CardRow>(db, `select * from paragraph_card where id = $1 and project_id = $2 ${lock ? "for update" : ""}`, [id, projectId]);
  if (!c) throw notFound("Cartão");
  return c;
}

async function loadLinks(db: Queryable, cardId: string) {
  const sources = await q<{
    reference_id: string;
    locator_label: string | null;
    locator: string | null;
    author_label: string;
    issued_year: number | null;
    title: string;
    archived_at: string | null;
  }>(
    db,
    `select s.reference_id, s.locator_label, s.locator, r.archived_at, ${SOURCE_LABEL_SQL}
       from paragraph_card_source s join reference r on r.id = s.reference_id
      where s.card_id = $1 order by s.position`,
    [cardId],
  );
  const excerpts = await q<{ id: string; reference_id: string; kind: string; text: string; locator_label: string | null; locator: string | null; is_translation: boolean; note: string | null }>(
    db,
    `select e.id, e.reference_id, e.kind, e.text, e.locator_label, e.locator, e.is_translation, e.note
       from paragraph_card_excerpt ce join excerpt e on e.id = ce.excerpt_id
      where ce.card_id = $1 order by ce.position`,
    [cardId],
  );
  return { sources, excerpts };
}

export async function listCards(db: Queryable, projectId: string, includeArchived = false) {
  const rows = await q<CardRow & { section_title: string | null; source_count: number; excerpt_count: number }>(
    db,
    `select c.*, s.title as section_title,
            (select count(*) from paragraph_card_source x where x.card_id = c.id)::int as source_count,
            (select count(*) from paragraph_card_excerpt x where x.card_id = c.id)::int as excerpt_count
       from paragraph_card c left join section s on s.id = c.section_id
      where c.project_id = $1 ${includeArchived ? "" : "and c.archived_at is null"}
      order by c.next_action_date nulls last, c.updated_at desc`,
    [projectId],
  );
  return rows;
}

export async function getCard(db: Queryable, projectId: string, id: string) {
  const card = await getRow(db, projectId, id);
  const links = await loadLinks(db, id);
  // Excertos das fontes ligadas que ainda não estão no cartão (para escolher).
  const candidates = links.sources.length
    ? await q(
        db,
        `select e.id, e.reference_id, e.kind, e.text, e.locator_label, e.locator, e.is_translation, e.note
           from excerpt e
          where e.project_id = $1 and e.archived_at is null and e.reference_id = any($2::uuid[])
            and not exists (select 1 from paragraph_card_excerpt ce where ce.card_id = $3 and ce.excerpt_id = e.id)
          order by e.created_at`,
        [projectId, links.sources.map((s) => s.reference_id), id],
      )
    : [];
  const section = card.section_id ? await one(db, "select id, title from section where id = $1", [card.section_id]) : null;
  const gaps = cardGaps({ ...card, ...links }, "review");
  return { card, ...links, candidates, section, gaps };
}

export async function createCard(db: Queryable, projectId: string, userId: string, body: unknown) {
  const data = parse(createSchema, body);
  await assertSection(db, projectId, data.section_id);
  const row = await one<CardRow>(
    db,
    `insert into paragraph_card (project_id, idea, question, section_id, stage, created_by)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [projectId, data.idea, data.question ?? null, data.section_id ?? null, data.stage, userId],
  );
  await audit(db, { projectId, userId, action: "create", entityType: "paragraph_card", entityId: row!.id, after: row });
  return row!;
}

/** Atualização com concorrência otimista (transação do chamador). Fontes e excertos são substituídos quando enviados. */
export async function updateCard(db: Queryable, projectId: string, userId: string, id: string, body: unknown) {
  const { version, sources, excerpt_ids, ...data } = parse(updateSchema, body);
  const before = await getRow(db, projectId, id, true);
  if (before.version !== version) {
    throw conflict("Este cartão foi alterado noutra sessão. As suas alterações não foram gravadas por cima.", {
      serverVersion: before.version,
      server: await getCard(db, projectId, id),
    });
  }
  await assertSection(db, projectId, data.section_id);
  const beforeLinks = await loadLinks(db, id);
  const cols = Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined);
  // Reabrir um cartão integrado (mudar a etapa) retira a marca de integração; o parágrafo fica na secção.
  const reopen = before.stage === "integrated" && data.stage !== undefined;
  const row = await one<CardRow>(
    db,
    `update paragraph_card set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}${cols.length ? "," : ""}
            ${reopen ? "integrated_at = null," : ""} version = version + 1, updated_at = now()
      where id = $1 and project_id = $2 returning *`,
    [id, projectId, ...cols.map((c) => (data as Record<string, unknown>)[c])],
  );
  if (sources) {
    const ids = sources.map((s) => s.reference_id);
    if (new Set(ids).size !== ids.length) throw badRequest("A mesma fonte aparece duas vezes no cartão.");
    if (ids.length) {
      const found = await q(db, "select id from reference where project_id = $1 and id = any($2::uuid[])", [projectId, ids]);
      if (found.length !== ids.length) throw badRequest("O cartão aponta para fontes que não existem neste projeto.");
    }
    await q(db, "delete from paragraph_card_source where card_id = $1", [id]);
    let p = 0;
    for (const s of sources)
      await q(db, "insert into paragraph_card_source (card_id, reference_id, position, locator_label, locator) values ($1,$2,$3,$4,$5)", [
        id,
        s.reference_id,
        ++p,
        s.locator_label ?? (s.locator ? "page" : null),
        s.locator ?? null,
      ]);
  }
  if (excerpt_ids) {
    const ids = [...new Set(excerpt_ids)];
    if (ids.length) {
      const found = await q(db, "select id from excerpt where project_id = $1 and id = any($2::uuid[])", [projectId, ids]);
      if (found.length !== ids.length) throw badRequest("O cartão aponta para excertos que não existem neste projeto.");
    }
    await q(db, "delete from paragraph_card_excerpt where card_id = $1", [id]);
    let p = 0;
    for (const e of ids) await q(db, "insert into paragraph_card_excerpt (card_id, excerpt_id, position) values ($1,$2,$3)", [id, e, ++p]);
  }
  const afterLinks = await loadLinks(db, id);
  const strip = (l: typeof beforeLinks) => ({
    sources: l.sources.map((s) => ({ reference_id: s.reference_id, locator_label: s.locator_label, locator: s.locator })),
    excerpt_ids: l.excerpts.map((e) => e.id),
  });
  await audit(db, {
    projectId,
    userId,
    action: "update",
    entityType: "paragraph_card",
    entityId: id,
    before: { ...before, ...strip(beforeLinks) },
    after: { ...row, ...strip(afterLinks) },
  });
  return getCard(db, projectId, id);
}

export async function setCardArchived(db: Queryable, projectId: string, userId: string, id: string, archived: boolean) {
  await getRow(db, projectId, id);
  await q(db, `update paragraph_card set archived_at = ${archived ? "now()" : "null"}, version = version + 1, updated_at = now() where id = $1`, [id]);
  await audit(db, { projectId, userId, action: archived ? "archive" : "restore", entityType: "paragraph_card", entityId: id });
}

const integrateSchema = z.object({
  version: z.number().int(),
  cite: z.boolean().default(true),
});

/** Parágrafos do documento gerados a partir do rascunho (linhas em branco separam parágrafos). */
export function draftToParagraphs(
  cardId: string,
  draft: string,
  cite: { referenceId: string; locatorLabel: string | null; locator: string | null }[] | null,
): DocNode[] {
  const blocks = draft
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((b, i) => {
    const content: DocNode[] = [];
    const lines = b.split("\n");
    lines.forEach((l, j) => {
      if (j > 0) content.push({ type: "hardBreak" });
      if (l.length) content.push({ type: "text", text: l });
    });
    if (cite && cite.length && i === blocks.length - 1) {
      // A citação entra antes do ponto final, como é habitual em APA (“… (Autor, ano).”).
      const last = content[content.length - 1];
      let tail = "";
      if (last?.type === "text" && /[.!?]$/.test(last.text!)) {
        tail = last.text!.slice(-1);
        last.text = last.text!.slice(0, -1).trimEnd();
        if (!last.text) content.pop();
      }
      content.push({ type: "text", text: " " });
      content.push({
        type: "citation",
        attrs: {
          id: crypto.randomUUID(),
          mode: "parenthetical",
          items: cite.map((c) => ({ referenceId: c.referenceId, locatorLabel: c.locator ? c.locatorLabel ?? "page" : null, locator: c.locator })),
        },
      });
      if (tail) content.push({ type: "text", text: tail });
    }
    return { type: "paragraph", attrs: { cardId }, content };
  });
}

/**
 * Integra o rascunho na secção de destino (transação do chamador): acrescenta no fim da secção,
 * cria um marco de revisão e marca o cartão como integrado. Não substitui texto existente.
 */
export async function integrateCard(db: Queryable, projectId: string, userId: string, id: string, body: unknown) {
  const { version, cite } = parse(integrateSchema, body);
  const card = await getRow(db, projectId, id, true);
  if (card.version !== version) throw conflict("Este cartão foi alterado noutra sessão. Recarregue antes de integrar.");
  if (card.archived_at) throw badRequest("Cartão arquivado.");
  if (card.stage === "integrated") throw badRequest("Este cartão já foi integrado. Reabra-o para integrar novamente.");
  if (!card.draft?.trim()) throw badRequest("O rascunho está vazio: não há parágrafo para integrar.");
  if (!card.section_id) throw badRequest("Escolha a secção de destino antes de integrar.");
  const { sources } = await loadLinks(db, id);
  const current = await getSection(db, projectId, card.section_id);
  if (current.section.archived_at) throw badRequest("A secção de destino está arquivada.");
  const paragraphs = draftToParagraphs(
    id,
    card.draft,
    cite ? sources.map((s) => ({ referenceId: s.reference_id, locatorLabel: s.locator_label, locator: s.locator })) : null,
  );
  const content = [...(current.doc.content ?? [])];
  // Um documento novo tem um parágrafo vazio: substitui-o em vez de deixar uma linha em branco no início.
  if (content.length === 1 && content[0]!.type === "paragraph" && !(content[0]!.content ?? []).length) content.pop();
  const saved = await saveContent(db, projectId, userId, card.section_id, {
    baseVersion: current.section.version,
    doc: { type: "doc", content: [...content, ...paragraphs] },
    checkpoint: true,
    note: `Integração do cartão “${card.idea.slice(0, 80)}”`,
  });
  const row = await one<CardRow>(
    db,
    `update paragraph_card set stage = 'integrated', integrated_section_id = $2, integrated_revision_id = $3,
            integrated_at = now(), version = version + 1, updated_at = now()
      where id = $1 returning *`,
    [id, card.section_id, saved.revisionId],
  );
  await audit(db, {
    projectId,
    userId,
    action: "integrate",
    entityType: "paragraph_card",
    entityId: id,
    summary: `Integrado na secção (revisão ${saved.revisionNumber})`,
    before: card,
    after: row,
  });
  return { card: row!, sectionId: card.section_id, revisionNumber: saved.revisionNumber, sectionVersion: saved.version };
}

/** Cartão sugerido para hoje: ação com data mais próxima; senão o mais avançado; senão o mais recente. */
export async function nextCard(db: Queryable, projectId: string) {
  const stageOrder = CARD_STAGES.map((s, i) => `when '${s}' then ${i}`).join(" ");
  const card = await one<CardRow & { section_title: string | null }>(
    db,
    `select c.*, s.title as section_title from paragraph_card c left join section s on s.id = c.section_id
      where c.project_id = $1 and c.archived_at is null and c.stage <> 'integrated'
      order by c.next_action_date nulls last, case c.stage ${stageOrder} end desc, c.updated_at desc limit 1`,
    [projectId],
  );
  const byStage = await q<{ stage: string; n: number }>(
    db,
    "select stage, count(*)::int as n from paragraph_card where project_id = $1 and archived_at is null group by stage",
    [projectId],
  );
  return { card: card ?? null, byStage: Object.fromEntries(byStage.map((r) => [r.stage, r.n])) };
}

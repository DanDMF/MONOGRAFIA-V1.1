import crypto from "node:crypto";
import { z } from "zod";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { parse, uuid } from "../../lib/validate.js";
import {
  DocValidationError,
  docWordCount,
  extractCitations,
  sanitizeDoc,
  visit,
  type CitationAttrs,
  type DocNode,
} from "../../../shared/doc.js";
import { TEMPLATES, computeNumbering, readingOrder, type TemplateNode, type SectionKind } from "../../../shared/templates.js";

export interface SectionRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  kind: SectionKind;
  template_key: string | null;
  title: string;
  position: number;
  numbered: boolean;
  status: string;
  guidance: string | null;
  include_in_word_count: boolean;
  weight: string | null;
  current_revision_id: string | null;
  version: number;
  archived_at: string | null;
  updated_at: string;
}

export const EMPTY_DOC: DocNode = { type: "doc", content: [{ type: "paragraph" }] };

export async function applyTemplate(db: Queryable, projectId: string, key: string, includeOptional = true) {
  const tpl = TEMPLATES[key];
  if (!tpl) throw badRequest("Modelo inexistente.");
  const [{ n } = { n: 0 }] = await q<{ n: number }>(
    db,
    "select coalesce(max(position), 0)::int as n from section where project_id = $1 and parent_id is null",
    [projectId],
  );
  let pos = n;
  const insert = async (node: TemplateNode, parentId: string | null, position: number) => {
    if (node.optional && !includeOptional) return;
    const row = await one<{ id: string }>(
      db,
      `insert into section (project_id, parent_id, kind, template_key, title, position, numbered, guidance)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [projectId, parentId, node.kind, node.key, node.title, position, node.numbered ?? true, node.guidance ?? null],
    );
    let p = 0;
    for (const c of node.children ?? []) await insert(c, row!.id, ++p);
  };
  for (const node of tpl.nodes) await insert(node, null, ++pos);
}

export async function listSections(db: Queryable, projectId: string, includeArchived = false) {
  const rows = await q<SectionRow & { word_count: number | null; revision_number: number | null; revision_at: string | null }>(
    db,
    `select s.*, r.word_count, r.number as revision_number, r.updated_at as revision_at
       from section s left join section_revision r on r.id = s.current_revision_id
      where s.project_id = $1 ${includeArchived ? "" : "and s.archived_at is null"}`,
    [projectId],
  );
  const numbering = computeNumbering(rows);
  return readingOrder(rows).map((s) => ({ ...s, number: numbering.get(s.id) ?? null }));
}

async function getSectionRow(db: Queryable, projectId: string, id: string): Promise<SectionRow> {
  parse(uuid, id);
  const s = await one<SectionRow>(db, "select * from section where id = $1 and project_id = $2", [id, projectId]);
  if (!s) throw notFound("Secção");
  return s;
}

export async function getSection(db: Queryable, projectId: string, id: string) {
  const s = await getSectionRow(db, projectId, id);
  const rev = s.current_revision_id
    ? await one<{ id: string; number: number; doc: DocNode; word_count: number; updated_at: string }>(
        db,
        "select id, number, doc, word_count, updated_at from section_revision where id = $1",
        [s.current_revision_id],
      )
    : undefined;
  return { section: s, revision: rev ?? null, doc: rev?.doc ?? EMPTY_DOC };
}

const sectionMetaSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  status: z.enum(["not_started", "drafting", "needs_source", "in_review", "ready", "published"]).optional(),
  numbered: z.boolean().optional(),
  guidance: z.string().max(5000).nullable().optional(),
  include_in_word_count: z.boolean().optional(),
  weight: z.union([z.string(), z.number()]).nullable().optional(),
  kind: z.enum(["preliminary", "chapter", "section", "appendix", "final"]).optional(),
});

export async function createSection(db: Queryable, projectId: string, userId: string, body: unknown) {
  const data = parse(
    z.object({
      parent_id: uuid.nullable().default(null),
      title: z.string().trim().min(1).max(500),
      kind: z.enum(["preliminary", "chapter", "section", "appendix", "final"]).default("section"),
      numbered: z.boolean().default(true),
    }),
    body,
  );
  if (data.parent_id) await getSectionRow(db, projectId, data.parent_id);
  const [{ n } = { n: 0 }] = await q<{ n: number }>(
    db,
    "select coalesce(max(position), 0)::int as n from section where project_id = $1 and parent_id is not distinct from $2",
    [projectId, data.parent_id],
  );
  const row = await one<SectionRow>(
    db,
    `insert into section (project_id, parent_id, kind, title, position, numbered) values ($1,$2,$3,$4,$5,$6) returning *`,
    [projectId, data.parent_id, data.parent_id ? "section" : data.kind, data.title, n + 1, data.numbered],
  );
  await audit(db, { projectId, userId, action: "create", entityType: "section", entityId: row!.id, after: row });
  return row!;
}

export async function updateSectionMeta(db: Queryable, projectId: string, userId: string, id: string, body: unknown) {
  const before = await getSectionRow(db, projectId, id);
  const data = parse(sectionMetaSchema, body);
  const cols = Object.keys(data).filter((k) => (data as Record<string, unknown>)[k] !== undefined);
  if (!cols.length) return before;
  const row = await one<SectionRow>(
    db,
    `update section set ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}, updated_at = now()
      where id = $1 and project_id = $2 returning *`,
    [id, projectId, ...cols.map((c) => (data as Record<string, unknown>)[c])],
  );
  await audit(db, { projectId, userId, action: "update", entityType: "section", entityId: id, before, after: row });
  return row!;
}

/** Move uma secção (novo pai e/ou posição). IDs preservados; numeração e referências cruzadas recalculadas. */
export async function moveSection(db: Queryable, projectId: string, userId: string, id: string, body: unknown) {
  const { parent_id, position } = parse(z.object({ parent_id: uuid.nullable(), position: z.number().int().min(1) }), body);
  const s = await getSectionRow(db, projectId, id);
  if (parent_id) {
    // impedir ciclos
    let cur: string | null = parent_id;
    while (cur) {
      if (cur === id) throw badRequest("Não é possível mover uma secção para dentro de si própria.");
      const p: { parent_id: string | null } | undefined = await one(db, "select parent_id from section where id = $1 and project_id = $2", [cur, projectId]);
      if (!p) throw notFound("Secção de destino");
      cur = p.parent_id;
    }
  }
  const siblings = await q<{ id: string }>(
    db,
    `select id from section where project_id = $1 and parent_id is not distinct from $2 and id <> $3 and archived_at is null
      order by position`,
    [projectId, parent_id, id],
  );
  const ids = siblings.map((x) => x.id);
  ids.splice(Math.min(position - 1, ids.length), 0, id);
  for (let i = 0; i < ids.length; i++) {
    await q(db, "update section set position = $2, parent_id = $3, updated_at = now() where id = $1", [ids[i], i + 1, parent_id]);
  }
  await audit(db, {
    projectId,
    userId,
    action: "move",
    entityType: "section",
    entityId: id,
    before: { parent_id: s.parent_id, position: s.position },
    after: { parent_id, position },
  });
}

export async function setSectionArchived(db: Queryable, projectId: string, userId: string, id: string, archived: boolean) {
  await getSectionRow(db, projectId, id);
  await q(db, `update section set archived_at = ${archived ? "now()" : "null"}, updated_at = now() where id = $1`, [id]);
  await audit(db, { projectId, userId, action: archived ? "archive" : "restore", entityType: "section", entityId: id });
}

/** Reatribui IDs de citação/xref que já pertencem a outra secção (ex.: texto copiado entre secções). */
async function dedupeNodeIds(db: Queryable, projectId: string, sectionId: string, doc: DocNode): Promise<boolean> {
  const ids: string[] = [];
  visit(doc, (n) => {
    if (n.type === "citation" || n.type === "citationBlock") ids.push(String(n.attrs?.id));
  });
  if (!ids.length) return false;
  const taken = new Set(
    (await q<{ id: string }>(db, "select id from citation where id = any($1::uuid[]) and section_id <> $2", [ids, sectionId])).map((r) => r.id),
  );
  if (!taken.size) return false;
  visit(doc, (n) => {
    if ((n.type === "citation" || n.type === "citationBlock") && taken.has(String(n.attrs?.id))) n.attrs!.id = crypto.randomUUID();
  });
  void projectId;
  return true;
}

async function rebuildCitationIndex(db: Queryable, projectId: string, sectionId: string, citations: CitationAttrs[]) {
  const refIds = [...new Set(citations.flatMap((c) => c.items.map((i) => i.referenceId).filter(Boolean) as string[]))];
  const pcIds = [...new Set(citations.flatMap((c) => c.items.map((i) => i.personalId).filter(Boolean) as string[]))];
  if (refIds.length) {
    const found = await q<{ id: string }>(db, "select id from reference where project_id = $1 and id = any($2::uuid[])", [projectId, refIds]);
    if (found.length !== refIds.length) throw badRequest("A secção cita fontes que não existem neste projeto.");
  }
  if (pcIds.length) {
    const found = await q<{ id: string }>(db, "select id from personal_communication where project_id = $1 and id = any($2::uuid[])", [projectId, pcIds]);
    if (found.length !== pcIds.length) throw badRequest("A secção cita comunicações pessoais inexistentes.");
  }
  await q(db, "delete from citation where section_id = $1", [sectionId]);
  let pos = 0;
  for (const c of citations) {
    let excerptId = c.excerptId ?? null;
    if (excerptId) {
      const ok = await one(db, "select 1 from excerpt where id = $1 and project_id = $2", [excerptId, projectId]);
      if (!ok) excerptId = null;
    }
    await q(
      db,
      `insert into citation (id, project_id, section_id, position, mode, quote_text, secondary_author, secondary_year, excerpt_id, attrs)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [c.id, projectId, sectionId, ++pos, c.mode, c.quote ?? null, c.secondaryAuthor ?? null, c.secondaryYear ?? null, excerptId, { ...c, excerptId }],
    );
    let ip = 0;
    for (const it of c.items) {
      await q(
        db,
        `insert into citation_item (citation_id, position, reference_id, personal_communication_id, locator_label, locator)
         values ($1,$2,$3,$4,$5,$6)`,
        [c.id, ++ip, it.referenceId ?? null, it.personalId ?? null, it.locatorLabel ?? null, it.locator ?? null],
      );
    }
  }
}

export const saveContentSchema = z.object({
  baseVersion: z.number().int().min(0),
  doc: z.unknown(),
  checkpoint: z.boolean().default(false),
  note: z.string().max(500).optional(),
});

const AUTOSAVE_COALESCE_MINUTES = 10;

/**
 * Grava o conteúdo de uma secção (transação do chamador). Controlo otimista: baseVersion tem de coincidir
 * com a versão atual, caso contrário devolve 409 com o conteúdo do servidor (sem sobrescrever).
 * Gravações automáticas do mesmo autor em 10 min são coalescidas; "checkpoint" cria sempre nova revisão.
 */
export async function saveContent(db: Queryable, projectId: string, userId: string, id: string, body: unknown) {
  const input = parse(saveContentSchema, body);
  const s = await one<SectionRow>(db, "select * from section where id = $1 and project_id = $2 for update", [id, projectId]);
  if (!s) throw notFound("Secção");
  if (s.version !== input.baseVersion) {
    const current = await getSection(db, projectId, id);
    throw conflict("Esta secção foi alterada noutra sessão. As suas alterações não foram gravadas por cima.", {
      serverVersion: s.version,
      serverDoc: current.doc,
    });
  }
  let doc: DocNode;
  try {
    doc = sanitizeDoc(input.doc);
  } catch (e) {
    if (e instanceof DocValidationError) throw badRequest(e.message);
    throw e;
  }
  const idsChanged = await dedupeNodeIds(db, projectId, id, doc);
  const wordCount = docWordCount(doc);
  const cur = s.current_revision_id
    ? await one<{ id: string; number: number; autosave: boolean; created_by: string | null; age_min: number }>(
        db,
        `select id, number, autosave, created_by, extract(epoch from now() - created_at) / 60 as age_min
           from section_revision where id = $1`,
        [s.current_revision_id],
      )
    : undefined;
  let revisionId: string;
  let revisionNumber: number;
  if (!input.checkpoint && cur && cur.autosave && cur.created_by === userId && cur.age_min < AUTOSAVE_COALESCE_MINUTES) {
    await q(db, "update section_revision set doc = $2, word_count = $3, updated_at = now() where id = $1", [cur.id, doc, wordCount]);
    revisionId = cur.id;
    revisionNumber = cur.number;
  } else {
    const r = await one<{ id: string; number: number }>(
      db,
      `insert into section_revision (section_id, project_id, number, doc, word_count, autosave, note, created_by)
       values ($1, $2, coalesce((select max(number) from section_revision where section_id = $1), 0) + 1, $3, $4, $5, $6, $7)
       returning id, number`,
      [id, projectId, doc, wordCount, !input.checkpoint, input.note ?? null, userId],
    );
    revisionId = r!.id;
    revisionNumber = r!.number;
  }
  const newStatus = s.status === "not_started" && wordCount > 0 ? "drafting" : s.status;
  const updated = await one<{ version: number }>(
    db,
    `update section set current_revision_id = $2, version = version + 1, status = $3, updated_at = now()
      where id = $1 returning version`,
    [id, revisionId, newStatus],
  );
  await rebuildCitationIndex(db, projectId, id, extractCitations(doc));
  if (input.checkpoint) {
    await audit(db, { projectId, userId, action: "checkpoint", entityType: "section", entityId: id, summary: input.note ?? `Revisão ${revisionNumber}` });
  }
  return { version: updated!.version, revisionId, revisionNumber, wordCount, doc: idsChanged ? doc : undefined, status: newStatus };
}

export async function listRevisions(db: Queryable, projectId: string, sectionId: string) {
  await getSectionRow(db, projectId, sectionId);
  return q(
    db,
    `select r.id, r.number, r.word_count, r.autosave, r.note, r.restored_from, r.created_at, r.updated_at,
            u.display_name as author
       from section_revision r left join app_user u on u.id = r.created_by
      where r.section_id = $1 order by r.number desc`,
    [sectionId],
  );
}

export async function getRevision(db: Queryable, projectId: string, sectionId: string, revisionId: string) {
  parse(uuid, revisionId);
  const r = await one(db, "select * from section_revision where id = $1 and section_id = $2 and project_id = $3", [revisionId, sectionId, projectId]);
  if (!r) throw notFound("Revisão");
  return r;
}

/** Restauro não destrutivo: cria nova revisão com o conteúdo antigo; o histórico mantém-se. */
export async function restoreRevision(db: Queryable, projectId: string, userId: string, sectionId: string, revisionId: string) {
  const rev = await getRevision(db, projectId, sectionId, revisionId);
  const s = await getSectionRow(db, projectId, sectionId);
  const result = await saveContent(db, projectId, userId, sectionId, {
    baseVersion: s.version,
    doc: rev.doc,
    checkpoint: true,
    note: `Restauro da revisão ${rev.number}`,
  });
  await q(db, "update section_revision set restored_from = $2 where id = $1", [result.revisionId, revisionId]);
  return result;
}

/** Todas as ocorrências de uma fonte no projeto (secção, modalidade, localizador). */
export async function citationOccurrences(db: Queryable, projectId: string, referenceId: string) {
  return q(
    db,
    `select c.id as citation_id, c.mode, c.section_id, s.title as section_title, ci.locator, ci.locator_label, c.quote_text
       from citation_item ci join citation c on c.id = ci.citation_id join section s on s.id = c.section_id
      where c.project_id = $1 and ci.reference_id = $2 and s.archived_at is null
      order by s.title, c.position`,
    [projectId, referenceId],
  );
}

import { z } from "zod";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { emptyToNull, isoDate, parse, uuid } from "../../lib/validate.js";
import type { CslItem, CslName } from "./csl.js";

export const REFERENCE_TYPES = [
  "article", "book", "chapter", "report", "thesis", "webpage", "dataset", "software",
  "preprint", "presentation", "video", "image", "legal", "other",
] as const;

const optText = (max = 1000) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();
const optInt = (min: number, max: number) =>
  z.preprocess(emptyToNull, z.coerce.number().int().min(min).max(max).nullable()).optional();

export const contributorSchema = z
  .object({
    role: z.enum(["author", "editor", "translator", "director", "host"]).default("author"),
    family: optText(300),
    given: optText(300),
    particle: optText(50),
    suffix: optText(50),
    literal: optText(500),
    abbreviation: optText(50),
  })
  .refine((c) => !!(c.literal || c.family), { message: "Cada contribuidor precisa de apelido ou nome institucional." });

export const referenceSchema = z.object({
  type: z.enum(REFERENCE_TYPES),
  title: z.string().trim().min(1).max(2000),
  container_title: optText(1000),
  site_name: optText(500),
  issued_year: optInt(1000, 2200),
  issued_month: optInt(1, 12),
  issued_day: optInt(1, 31),
  issued_season: optText(50),
  no_date: z.boolean().optional(),
  volume: optText(50),
  issue: optText(50),
  pages: optText(50),
  article_number: optText(50),
  edition: optText(100),
  publisher: optText(500),
  institution: optText(500),
  genre: optText(300),
  thesis_published: z.boolean().nullable().optional(),
  archive: optText(500),
  report_number: optText(100),
  version_label: optText(100),
  medium: optText(200),
  doi: optText(300),
  url: z.preprocess(emptyToNull, z.string().trim().url().max(2000).nullable()).optional(),
  isbn: optText(50),
  language: optText(20),
  accessed_date: z.preprocess(emptyToNull, isoDate.nullable()).optional(),
  show_accessed: z.boolean().optional(),
  license: optText(300),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  notes: optText(20000),
  abstract: optText(20000),
  read_status: z.enum(["to_read", "reading", "read", "skimmed"]).optional(),
  verification_status: z.enum(["unverified", "author_confirmed", "checked_at_source"]).optional(),
  metadata_source: optText(50),
  contributors: z.array(contributorSchema).max(500).default([]),
});
export type ReferenceInput = z.infer<typeof referenceSchema>;

export interface ReferenceRow {
  id: string;
  project_id: string;
  type: string;
  title: string;
  version: number;
  archived_at: string | null;
  issued_year: number | null;
  container_title: string | null;
  doi: string | null;
  url: string | null;
  read_status: string;
  verification_status: string;
  no_date: boolean;
  accessed_date: string | null;
  [k: string]: unknown;
}
export interface ContributorRow {
  id: string;
  reference_id: string;
  role: string;
  position: number;
  family: string | null;
  given: string | null;
  particle: string | null;
  suffix: string | null;
  literal: string | null;
  abbreviation: string | null;
}

/** DOI normalizado: sem prefixo de ligação, minúsculas. */
export function normalizeDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  const d = doi.trim().replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  return d ? d.toLowerCase() : null;
}
export const isValidDoi = (doi: string) => /^10\.\d{4,9}\/\S+$/.test(doi);

const CSL_TYPE: Record<string, string> = {
  article: "article-journal",
  book: "book",
  chapter: "chapter",
  report: "report",
  thesis: "thesis",
  webpage: "webpage",
  dataset: "dataset",
  software: "software",
  preprint: "article",
  presentation: "speech",
  video: "motion_picture",
  image: "graphic",
  legal: "legislation",
  other: "document",
};

function name(c: ContributorRow): CslName {
  if (c.literal) return { literal: c.literal };
  const n: CslName = { family: c.family ?? "" };
  if (c.given) n.given = c.given;
  if (c.particle) n["non-dropping-particle"] = c.particle;
  if (c.suffix) n.suffix = c.suffix;
  return n;
}

/** Converte uma referência e os seus contribuidores em CSL-JSON (entrada do motor APA). */
export function toCsl(r: Record<string, unknown>, contributors: ContributorRow[]): CslItem {
  const s = (k: string) => (r[k] == null || r[k] === "" ? undefined : String(r[k]));
  const item: CslItem = { id: String(r.id), type: CSL_TYPE[String(r.type)] ?? "document", title: String(r.title) };
  const byRole = (role: string) => contributors.filter((c) => c.role === role).sort((a, b) => a.position - b.position).map(name);
  for (const role of ["author", "editor", "translator", "director"] as const) {
    const names = byRole(role);
    if (names.length) item[role] = names;
  }
  if (!r.no_date && r.issued_year) {
    const parts = [Number(r.issued_year)];
    if (r.issued_month) {
      parts.push(Number(r.issued_month));
      if (r.issued_day) parts.push(Number(r.issued_day));
    }
    item.issued = { "date-parts": [parts], ...(s("issued_season") ? { season: s("issued_season") } : {}) };
  }
  const map: [string, string][] = [
    ["container_title", "container-title"],
    ["volume", "volume"],
    ["issue", "issue"],
    ["pages", "page"],
    ["edition", "edition"],
    ["genre", "genre"],
    ["archive", "archive"],
    ["version_label", "version"],
    ["medium", "medium"],
    ["url", "URL"],
    ["isbn", "ISBN"],
    ["language", "language"],
  ];
  for (const [from, to] of map) if (s(from)) item[to] = s(from);
  if (s("article_number")) item.number = s("article_number");
  if (s("report_number")) item.number = s("report_number");
  const publisher = s("publisher") ?? (r.type === "thesis" || r.type === "report" ? s("institution") : undefined);
  if (publisher) item.publisher = publisher;
  if (r.type === "webpage" && s("site_name")) item["container-title"] = s("site_name");
  const doi = normalizeDoi(s("doi"));
  if (doi) item.DOI = doi;
  if (r.type === "thesis" && r.thesis_published === false && !s("genre")) item.genre = "Dissertação não publicada";
  // Data de consulta: guardada sempre; passada ao estilo só quando o autor a marca como exigida
  // (conteúdo concebido para mudar) ou quando a página não tem data.
  const accessed = s("accessed_date");
  if (accessed && (r.show_accessed || (r.no_date && r.type === "webpage"))) {
    const [y, m, d] = accessed.split("-").map(Number);
    item.accessed = { "date-parts": [[y, m, d]] };
  }
  return item;
}

export async function loadContributors(db: Queryable, referenceIds: string[]): Promise<Map<string, ContributorRow[]>> {
  const out = new Map<string, ContributorRow[]>();
  if (!referenceIds.length) return out;
  const rows = await q<ContributorRow>(
    db,
    "select * from reference_contributor where reference_id = any($1::uuid[]) order by role, position",
    [referenceIds],
  );
  for (const r of rows) out.set(r.reference_id, [...(out.get(r.reference_id) ?? []), r]);
  return out;
}

export async function listReferences(db: Queryable, projectId: string, opt: { includeArchived?: boolean; search?: string } = {}) {
  const params: unknown[] = [projectId];
  let where = "r.project_id = $1";
  if (!opt.includeArchived) where += " and r.archived_at is null";
  if (opt.search) {
    params.push(`%${opt.search.toLowerCase()}%`);
    where += ` and (lower(r.title) like $2 or exists (select 1 from reference_contributor c where c.reference_id = r.id
               and lower(coalesce(c.family,'') || ' ' || coalesce(c.given,'') || ' ' || coalesce(c.literal,'')) like $2)
               or r.issued_year::text like $2 or exists (select 1 from unnest(r.tags) t where lower(t) like $2))`;
  }
  const refs = await q<ReferenceRow>(
    db,
    `select r.*, (select count(*) from citation_item ci join citation c on c.id = ci.citation_id
                   where ci.reference_id = r.id)::int as citation_count
       from reference r where ${where} order by r.created_at desc`,
    params,
  );
  const contrib = await loadContributors(db, refs.map((r) => r.id));
  return refs.map((r) => ({ ...r, contributors: contrib.get(r.id) ?? [] }));
}

export async function getReference(db: Queryable, projectId: string, id: string) {
  parse(uuid, id);
  const r = await one<ReferenceRow>(db, "select * from reference where id = $1 and project_id = $2", [id, projectId]);
  if (!r) throw notFound("Referência");
  const contributors = (await loadContributors(db, [id])).get(id) ?? [];
  return { ...r, contributors };
}

const REF_COLUMNS = Object.keys(referenceSchema.shape).filter((k) => k !== "contributors");

async function writeContributors(db: Queryable, referenceId: string, list: ReferenceInput["contributors"]) {
  await q(db, "delete from reference_contributor where reference_id = $1", [referenceId]);
  const pos: Record<string, number> = {};
  for (const c of list) {
    const p = (pos[c.role] = (pos[c.role] ?? 0) + 1);
    await q(
      db,
      `insert into reference_contributor (reference_id, role, position, family, given, particle, suffix, literal, abbreviation)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [referenceId, c.role, p, c.family ?? null, c.given ?? null, c.particle ?? null, c.suffix ?? null, c.literal ?? null, c.abbreviation ?? null],
    );
  }
}

export async function createReference(db: Queryable, projectId: string, userId: string, body: unknown) {
  const data = parse(referenceSchema, body);
  if (data.doi && !isValidDoi(normalizeDoi(data.doi)!)) throw badRequest("DOI com formato inválido (esperado 10.xxxx/...).");
  const cols = REF_COLUMNS.filter((c) => (data as Record<string, unknown>)[c] !== undefined);
  const vals = cols.map((c) => {
    const v = (data as Record<string, unknown>)[c];
    return c === "doi" ? normalizeDoi(v as string) : v;
  });
  const row = await one<ReferenceRow>(
    db,
    `insert into reference (project_id, created_by, ${cols.join(", ")})
     values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) returning *`,
    [projectId, userId, ...vals],
  );
  await writeContributors(db, row!.id, data.contributors);
  const full = await getReference(db, projectId, row!.id);
  await audit(db, { projectId, userId, action: "create", entityType: "reference", entityId: row!.id, after: full });
  return full;
}

export async function updateReference(db: Queryable, projectId: string, userId: string, id: string, body: unknown) {
  const before = await getReference(db, projectId, id);
  const { version, ...rest } = parse(referenceSchema.extend({ version: z.coerce.number().int() }), body);
  if (rest.doi && !isValidDoi(normalizeDoi(rest.doi)!)) throw badRequest("DOI com formato inválido (esperado 10.xxxx/...).");
  const cols = REF_COLUMNS;
  const vals = cols.map((c) => {
    const v = (rest as Record<string, unknown>)[c];
    if (c === "doi") return normalizeDoi(v as string);
    if (v === undefined) {
      if (c === "tags") return [];
      if (c === "no_date" || c === "show_accessed") return false;
      if (c === "read_status") return before.read_status;
      if (c === "verification_status") return before.verification_status;
      return null;
    }
    return v;
  });
  const row = await one<ReferenceRow>(
    db,
    `update reference set ${cols.map((c, i) => `${c} = $${i + 4}`).join(", ")}, version = version + 1, updated_at = now()
      where id = $1 and project_id = $2 and version = $3 returning *`,
    [id, projectId, version, ...vals],
  );
  if (!row) throw conflict("A referência foi alterada noutra sessão. Recarregue antes de gravar.", { current: before });
  await writeContributors(db, id, rest.contributors);
  const after = await getReference(db, projectId, id);
  await audit(db, { projectId, userId, action: "update", entityType: "reference", entityId: id, before, after });
  return after;
}

export async function setReferenceArchived(db: Queryable, projectId: string, userId: string, id: string, archived: boolean) {
  const row = await one(
    db,
    `update reference set archived_at = ${archived ? "now()" : "null"}, version = version + 1 where id = $1 and project_id = $2 returning id`,
    [id, projectId],
  );
  if (!row) throw notFound("Referência");
  await audit(db, { projectId, userId, action: archived ? "archive" : "restore", entityType: "reference", entityId: id });
}

const normTitle = (t: string) =>
  t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Candidatos a duplicado: mesmo DOI ou mesmo título normalizado e ano. */
export async function findDuplicates(db: Queryable, projectId: string) {
  const refs = await q<{ id: string; title: string; issued_year: number | null; doi: string | null }>(
    db,
    "select id, title, issued_year, doi from reference where project_id = $1 and archived_at is null",
    [projectId],
  );
  const groups = new Map<string, string[]>();
  for (const r of refs) {
    const keys = [r.doi ? `doi:${normalizeDoi(r.doi)}` : null, `t:${normTitle(r.title)}|${r.issued_year ?? "?"}`].filter(Boolean) as string[];
    for (const k of keys) groups.set(k, [...(groups.get(k) ?? []), r.id]);
  }
  const seen = new Set<string>();
  const out: { reason: string; ids: string[] }[] = [];
  for (const [k, ids] of groups) {
    if (ids.length < 2) continue;
    const key = [...ids].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ reason: k.startsWith("doi:") ? "Mesmo DOI" : "Mesmo título e ano", ids });
  }
  return out;
}

/** Pré-visualização da fusão: o que será transferido para a referência mantida. */
export async function mergePreview(db: Queryable, projectId: string, keepId: string, dropId: string) {
  if (keepId === dropId) throw badRequest("Escolha duas referências diferentes.");
  const keep = await getReference(db, projectId, keepId);
  const drop = await getReference(db, projectId, dropId);
  const [c] = await q<{ n: number }>(db, "select count(*)::int as n from citation_item where reference_id = $1", [dropId]);
  const [e] = await q<{ n: number }>(db, "select count(*)::int as n from excerpt where reference_id = $1", [dropId]);
  return { keep, drop, citationsToMove: c?.n ?? 0, excerptsToMove: e?.n ?? 0 };
}

/**
 * Funde "drop" em "keep". As citações existentes passam a apontar para "keep" também no documento
 * (os atributos dos nós de citação são reescritos nas revisões atuais), preservando todas as ocorrências.
 */
export async function mergeReferences(db: Queryable, projectId: string, userId: string, keepId: string, dropId: string) {
  const preview = await mergePreview(db, projectId, keepId, dropId);
  await q(db, "update citation_item set reference_id = $1 where reference_id = $2", [keepId, dropId]);
  await q(db, "update excerpt set reference_id = $1 where reference_id = $2", [keepId, dropId]);
  await q(
    db,
    `delete from reading_note where reference_id = $2 and exists (select 1 from reading_note where reference_id = $1)`,
    [keepId, dropId],
  );
  await q(db, "update reading_note set reference_id = $1 where reference_id = $2", [keepId, dropId]);
  // Reescrever os documentos das revisões atuais (nova revisão não é criada: a mudança é de identidade, auditada)
  const revs = await q<{ id: string; doc: unknown }>(
    db,
    `select r.id, r.doc from section_revision r join section s on s.current_revision_id = r.id
      where s.project_id = $1 and r.doc::text like $2`,
    [projectId, `%${dropId}%`],
  );
  for (const r of revs) {
    const doc = JSON.parse(JSON.stringify(r.doc).split(dropId).join(keepId));
    await q(db, "update section_revision set doc = $2, updated_at = now() where id = $1", [r.id, doc]);
  }
  await q(
    db,
    "update citation set attrs = replace(attrs::text, $2, $1)::jsonb where project_id = $3 and attrs::text like $4",
    [keepId, dropId, projectId, `%${dropId}%`],
  );
  await q(db, "update reference set archived_at = now(), merged_into = $1, version = version + 1 where id = $2", [keepId, dropId]);
  await audit(db, {
    projectId,
    userId,
    action: "merge",
    entityType: "reference",
    entityId: keepId,
    summary: `Fundida a referência ${dropId}`,
    before: preview.drop,
  });
  return preview;
}

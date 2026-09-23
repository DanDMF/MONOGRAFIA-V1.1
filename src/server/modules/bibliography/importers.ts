// Importação BibTeX, RIS e CSL-JSON. Nunca inventa campos ausentes; separações de nome inferidas são assinaladas.
// Fluxo: dryRun → pré-visualização com duplicados e avisos → confirmação → criação (metadata_source registado).
import type { Queryable } from "../../db/pool.js";
import { q } from "../../db/pool.js";
import { createReference, normalizeDoi, type ReferenceInput } from "./references.js";

type Contributor = ReferenceInput["contributors"][number];
export interface ImportCandidate {
  data: Partial<ReferenceInput> & { title?: string; type?: ReferenceInput["type"] };
  warnings: string[];
  duplicateOf?: string | null;
  sourceKey?: string;
}

const BIBTEX_TYPES: Record<string, ReferenceInput["type"]> = {
  article: "article",
  book: "book",
  incollection: "chapter",
  inbook: "chapter",
  techreport: "report",
  report: "report",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  thesis: "thesis",
  online: "webpage",
  misc: "other",
  dataset: "dataset",
  software: "software",
  unpublished: "other",
  inproceedings: "chapter",
};

function stripBraces(s: string) {
  return s.replace(/[{}]/g, "").replace(/\\&/g, "&").replace(/\s+/g, " ").trim();
}

/** Divide nomes BibTeX por " and " fora de chavetas. */
function splitBibNames(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  const tokens = s.split(/(\{|\}|\s+and\s+)/i);
  for (const t of tokens) {
    if (t === "{") depth++;
    if (t === "}") depth--;
    if (/^\s+and\s+$/i.test(t) && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += t;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function parsePersonName(raw: string, warnings: string[]): Contributor {
  const trimmed = raw.trim();
  if (/^\{.*\}$/.test(trimmed)) return { role: "author", literal: stripBraces(trimmed) }; // {Instituição}
  const clean = stripBraces(trimmed);
  if (clean.includes(",")) {
    const [family, given] = clean.split(",", 2).map((x) => x.trim());
    return { role: "author", family: family!, given: given || null };
  }
  const parts = clean.split(" ");
  if (parts.length === 1) return { role: "author", family: clean };
  warnings.push(`Separação apelido/nome inferida para “${clean}” — confirmar.`);
  return { role: "author", family: parts.pop()!, given: parts.join(" ") };
}

export function parseBibtex(src: string): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  const entryRe = /@(\w+)\s*\{\s*([^,\s]*)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(src))) {
    const kind = m[1]!.toLowerCase();
    if (["comment", "string", "preamble"].includes(kind)) continue;
    // Encontrar o fim da entrada contando chavetas
    let depth = 1;
    let i = entryRe.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    const body = src.slice(entryRe.lastIndex, i - 1);
    entryRe.lastIndex = i;
    const fields: Record<string, string> = {};
    const fieldRe = /(\w+)\s*=\s*/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(body))) {
      const name = f[1]!.toLowerCase();
      let j = fieldRe.lastIndex;
      let value = "";
      if (body[j] === "{") {
        let d = 0;
        const start = j;
        for (; j < body.length; j++) {
          if (body[j] === "{") d++;
          else if (body[j] === "}") {
            d--;
            if (d === 0) break;
          }
        }
        value = body.slice(start + 1, j);
        j++;
      } else if (body[j] === '"') {
        const end = body.indexOf('"', j + 1);
        value = body.slice(j + 1, end);
        j = end + 1;
      } else {
        const end = body.slice(j).search(/[,\n]/);
        value = body.slice(j, end < 0 ? undefined : j + end).trim();
        j = end < 0 ? body.length : j + end;
      }
      fields[name] = value;
      fieldRe.lastIndex = j;
    }
    const warnings: string[] = [];
    const type = BIBTEX_TYPES[kind] ?? "other";
    if (!BIBTEX_TYPES[kind]) warnings.push(`Tipo BibTeX @${kind} mapeado para “outro”.`);
    const contributors: Contributor[] = [
      ...(fields.author ? splitBibNames(fields.author).map((n) => parsePersonName(n, warnings)) : []),
      ...(fields.editor ? splitBibNames(fields.editor).map((n) => ({ ...parsePersonName(n, warnings), role: "editor" as const })) : []),
    ];
    const year = fields.year ? Number(/\d{4}/.exec(fields.year)?.[0]) : null;
    if (!year) warnings.push("Sem ano: confirmar se a obra é sem data.");
    const data: ImportCandidate["data"] = {
      type,
      title: fields.title ? stripBraces(fields.title) : undefined,
      container_title: stripBraces(fields.journal ?? fields.booktitle ?? fields.journaltitle ?? "") || null,
      issued_year: year || null,
      volume: fields.volume ? stripBraces(fields.volume) : null,
      issue: fields.number ? stripBraces(fields.number) : null,
      pages: fields.pages ? stripBraces(fields.pages).replace(/--/g, "–") : null,
      publisher: stripBraces(fields.publisher ?? "") || null,
      institution: stripBraces(fields.school ?? fields.institution ?? "") || null,
      genre: kind === "phdthesis" ? "Tese de doutoramento" : kind === "mastersthesis" ? "Dissertação de mestrado" : null,
      doi: fields.doi ? stripBraces(fields.doi) : null,
      url: fields.url ? stripBraces(fields.url) : null,
      isbn: fields.isbn ? stripBraces(fields.isbn) : null,
      edition: fields.edition ? stripBraces(fields.edition) : null,
      language: fields.language ? stripBraces(fields.language) : null,
      abstract: fields.abstract ? stripBraces(fields.abstract) : null,
      metadata_source: "bibtex",
      contributors,
    };
    if (!data.title) warnings.push("Entrada sem título: não será importada.");
    out.push({ data, warnings, sourceKey: m[2] });
  }
  return out;
}

const RIS_TYPES: Record<string, ReferenceInput["type"]> = {
  JOUR: "article",
  JFULL: "article",
  BOOK: "book",
  CHAP: "chapter",
  RPRT: "report",
  THES: "thesis",
  ELEC: "webpage",
  WEB: "webpage",
  DATA: "dataset",
  COMP: "software",
  VIDEO: "video",
  GEN: "other",
};

export function parseRis(src: string): ImportCandidate[] {
  const out: ImportCandidate[] = [];
  let cur: Record<string, string[]> | null = null;
  for (const line of src.split(/\r?\n/)) {
    const m = /^([A-Z][A-Z0-9])  - ?(.*)$/.exec(line);
    if (!m) continue;
    const [, tag, value] = m as unknown as [string, string, string];
    if (tag === "TY") cur = { TY: [value.trim()] };
    else if (tag === "ER") {
      if (cur) out.push(risToCandidate(cur));
      cur = null;
    } else if (cur) (cur[tag] ??= []).push(value.trim());
  }
  return out;
}

function risToCandidate(r: Record<string, string[]>): ImportCandidate {
  const warnings: string[] = [];
  const g = (...tags: string[]) => tags.map((t) => r[t]?.[0]).find((v) => v) ?? null;
  const ty = r.TY?.[0] ?? "GEN";
  const type = RIS_TYPES[ty] ?? "other";
  const names = (tags: string[], role: Contributor["role"]) =>
    tags.flatMap((t) => r[t] ?? []).map((n) => ({ ...parsePersonName(n, warnings), role }));
  const yearStr = g("PY", "Y1", "DA");
  const year = yearStr ? Number(/\d{4}/.exec(yearStr)?.[0]) || null : null;
  if (!year) warnings.push("Sem ano: confirmar se a obra é sem data.");
  const sp = g("SP");
  const ep = g("EP");
  const data: ImportCandidate["data"] = {
    type,
    title: g("TI", "T1") ?? undefined,
    container_title: g("T2", "JO", "JF", "JA"),
    issued_year: year,
    volume: g("VL"),
    issue: g("IS"),
    pages: sp ? (ep ? `${sp}–${ep}` : sp) : null,
    publisher: g("PB"),
    doi: g("DO"),
    url: g("UR"),
    isbn: g("SN"),
    language: g("LA"),
    edition: g("ET"),
    abstract: g("AB"),
    tags: (r.KW ?? []).slice(0, 50),
    metadata_source: "ris",
    contributors: [...names(["AU", "A1"], "author"), ...names(["ED", "A2"], "editor")],
  };
  if (!data.title) warnings.push("Entrada sem título: não será importada.");
  return { data, warnings };
}

const CSL_TO_TYPE: Record<string, ReferenceInput["type"]> = {
  "article-journal": "article",
  "article-magazine": "article",
  "article-newspaper": "article",
  article: "preprint",
  book: "book",
  chapter: "chapter",
  report: "report",
  thesis: "thesis",
  webpage: "webpage",
  "post-weblog": "webpage",
  dataset: "dataset",
  software: "software",
  speech: "presentation",
  motion_picture: "video",
  graphic: "image",
  legislation: "legal",
};

export function parseCslJson(src: string): ImportCandidate[] {
  const parsed = JSON.parse(src) as unknown;
  const list = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[];
  return list.map((it) => {
    const warnings: string[] = [];
    const names = (k: string, role: Contributor["role"]) =>
      ((it[k] as Record<string, string>[] | undefined) ?? []).map((n) =>
        n.literal
          ? { role, literal: n.literal }
          : { role, family: n.family ?? "", given: n.given ?? null, particle: n["non-dropping-particle"] ?? null, suffix: n.suffix ?? null },
      );
    const dp = (it.issued as { "date-parts"?: number[][] } | undefined)?.["date-parts"]?.[0];
    const t = CSL_TO_TYPE[String(it.type)] ?? "other";
    if (!CSL_TO_TYPE[String(it.type)]) warnings.push(`Tipo CSL “${String(it.type)}” mapeado para “outro”.`);
    if (!dp?.[0]) warnings.push("Sem data de publicação: confirmar se a obra é sem data.");
    const s = (k: string) => (it[k] == null ? null : String(it[k]));
    return {
      data: {
        type: t,
        title: s("title") ?? undefined,
        container_title: s("container-title"),
        issued_year: dp?.[0] ?? null,
        issued_month: dp?.[1] ?? null,
        issued_day: dp?.[2] ?? null,
        volume: s("volume"),
        issue: s("issue"),
        pages: s("page"),
        publisher: s("publisher"),
        genre: s("genre"),
        archive: s("archive"),
        doi: s("DOI"),
        url: s("URL"),
        isbn: s("ISBN"),
        language: s("language"),
        edition: s("edition"),
        version_label: s("version"),
        abstract: s("abstract"),
        metadata_source: "csl-json",
        contributors: [...names("author", "author"), ...names("editor", "editor")],
      },
      warnings,
    };
  });
}

export async function importBibliography(
  db: Queryable,
  projectId: string,
  userId: string,
  format: "bibtex" | "ris" | "csl-json",
  content: string,
  dryRun: boolean,
) {
  let candidates: ImportCandidate[];
  try {
    candidates = format === "bibtex" ? parseBibtex(content) : format === "ris" ? parseRis(content) : parseCslJson(content);
  } catch (e) {
    return { ok: false, error: `Ficheiro não reconhecido: ${(e as Error).message}`, candidates: [] };
  }
  const existing = await q<{ id: string; doi: string | null; title: string; issued_year: number | null }>(
    db,
    "select id, doi, title, issued_year from reference where project_id = $1 and archived_at is null",
    [projectId],
  );
  const norm = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const c of candidates) {
    const doi = normalizeDoi(c.data.doi ?? null);
    const dup = existing.find(
      (e) => (doi && normalizeDoi(e.doi) === doi) || (c.data.title && norm(e.title) === norm(c.data.title) && e.issued_year === (c.data.issued_year ?? null)),
    );
    c.duplicateOf = dup?.id ?? null;
    if (dup) c.warnings.push("Possível duplicado de uma referência existente: não será importada automaticamente.");
  }
  if (dryRun) return { ok: true, candidates };
  const created: string[] = [];
  const skipped: { title?: string; reason: string }[] = [];
  for (const c of candidates) {
    if (!c.data.title) {
      skipped.push({ reason: "Sem título" });
      continue;
    }
    if (c.duplicateOf) {
      skipped.push({ title: c.data.title, reason: "Possível duplicado" });
      continue;
    }
    // Savepoint por entrada: uma entrada inválida não anula as restantes (chamado dentro de transação).
    await q(db, "savepoint import_entry");
    try {
      const r = await createReference(db, projectId, userId, { ...c.data, verification_status: "unverified" });
      created.push(r.id);
      await q(db, "release savepoint import_entry");
    } catch (e) {
      await q(db, "rollback to savepoint import_entry");
      skipped.push({ title: c.data.title, reason: (e as Error).message });
    }
  }
  return { ok: true, created, skipped, candidates };
}

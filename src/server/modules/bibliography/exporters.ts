// Exportação bibliográfica: CSL-JSON (a partir de toCsl), BibTeX e RIS. Não acrescenta campos inexistentes.
import type { CslItem, CslName } from "./csl.js";

export function toCslJson(items: CslItem[]): string {
  return JSON.stringify(items, null, 2);
}

const BIB_TYPE: Record<string, string> = {
  "article-journal": "article",
  book: "book",
  chapter: "incollection",
  report: "techreport",
  thesis: "phdthesis",
  webpage: "online",
  dataset: "dataset",
  software: "software",
  article: "misc",
  speech: "misc",
  motion_picture: "misc",
  graphic: "misc",
  legislation: "misc",
  document: "misc",
};
const RIS_TYPE: Record<string, string> = {
  "article-journal": "JOUR",
  book: "BOOK",
  chapter: "CHAP",
  report: "RPRT",
  thesis: "THES",
  webpage: "ELEC",
  dataset: "DATA",
  software: "COMP",
  motion_picture: "VIDEO",
};

const bibName = (n: CslName) =>
  n.literal ? `{${n.literal}}` : [[n["non-dropping-particle"], n.family].filter(Boolean).join(" "), n.given].filter(Boolean).join(", ");
const risName = (n: CslName) => n.literal ?? [[n["non-dropping-particle"], n.family].filter(Boolean).join(" "), n.given].filter(Boolean).join(", ");
const esc = (s: string) => s.replace(/[{}]/g, "").replace(/&/g, "\\&");
const year = (it: CslItem) => (it.issued as { "date-parts"?: number[][] } | undefined)?.["date-parts"]?.[0]?.[0];

function citeKey(it: CslItem, used: Set<string>) {
  const a = it.author?.[0];
  const base = ((a?.family ?? a?.literal ?? "anon").normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "ref") + (year(it) ?? "sd");
  let k = base;
  let i = 0;
  while (used.has(k)) k = base + String.fromCharCode(97 + i++);
  used.add(k);
  return k;
}

export function toBibtex(items: CslItem[]): string {
  const used = new Set<string>();
  return items
    .map((it) => {
      const f: [string, unknown][] = [
        ["author", it.author?.map(bibName).join(" and ")],
        ["editor", it.editor?.map(bibName).join(" and ")],
        ["title", it.title ? `{${esc(it.title)}}` : undefined],
        [it.type === "chapter" ? "booktitle" : "journal", it["container-title"]],
        ["year", year(it)],
        ["volume", it.volume],
        ["number", it.issue ?? it.number],
        ["pages", typeof it.page === "string" ? it.page.replace(/[–-]/, "--") : undefined],
        ["edition", it.edition],
        [it.type === "thesis" ? "school" : it.type === "report" ? "institution" : "publisher", it.publisher],
        ["doi", it.DOI],
        ["url", it.URL],
        ["isbn", it.ISBN],
        ["language", it.language],
      ];
      const body = f
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => {
          const raw = String(v);
          // título já protegido por chavetas; nomes mantêm as chavetas dos autores institucionais
          const val = k === "title" ? raw.slice(1, -1) : k === "author" || k === "editor" ? raw.replace(/&/g, "\\&") : esc(raw);
          return `  ${k} = {${val}}`;
        })
        .join(",\n");
      return `@${BIB_TYPE[it.type] ?? "misc"}{${citeKey(it, used)},\n${body}\n}`;
    })
    .join("\n\n") + "\n";
}

export function toRis(items: CslItem[]): string {
  return items
    .map((it) => {
      const lines: string[] = [`TY  - ${RIS_TYPE[it.type] ?? "GEN"}`];
      for (const a of it.author ?? []) lines.push(`AU  - ${risName(a)}`);
      for (const e of it.editor ?? []) lines.push(`ED  - ${risName(e)}`);
      const push = (tag: string, v: unknown) => v !== undefined && v !== null && v !== "" && lines.push(`${tag}  - ${String(v)}`);
      push("TI", it.title);
      push("T2", it["container-title"]);
      push("PY", year(it));
      push("VL", it.volume);
      push("IS", it.issue);
      if (typeof it.page === "string") {
        const [sp, ep] = it.page.split(/[–-]/);
        push("SP", sp);
        push("EP", ep);
      }
      push("PB", it.publisher);
      push("DO", it.DOI);
      push("UR", it.URL);
      push("SN", it.ISBN);
      push("LA", it.language);
      lines.push("ER  - ");
      return lines.join("\r\n");
    })
    .join("\r\n\r\n") + "\r\n";
}

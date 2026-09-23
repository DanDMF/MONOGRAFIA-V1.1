// Motor APA 7: citeproc-js + estilo CSL APA (vendor/csl, versão fixada e documentada em docs/DECISIONS.md).
// Complementos verificados por testes: narrativa com "e"/"and", ordem dos itens igual à lista de referências,
// siglas de autores institucionais, fontes secundárias e comunicações pessoais.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
// @ts-expect-error — citeproc não publica tipos
import CSL from "citeproc";
import type { CitationAttrs, CitationItemAttrs } from "../../../shared/doc.js";

export type CitationLocale = "pt-PT" | "en-US";

const VENDOR = path.resolve(process.env.CSL_DIR ?? "vendor/csl");
let cache: { style: string; locales: Record<string, string>; styleInfo: StyleInfo } | null = null;

export interface StyleInfo {
  id: string;
  updated: string;
  sha256: string;
  engine: string;
}

function assets() {
  if (!cache) {
    const style = fs.readFileSync(path.join(VENDOR, "apa.csl"), "utf8");
    cache = {
      style,
      locales: {
        "pt-PT": fs.readFileSync(path.join(VENDOR, "locales-pt-PT.xml"), "utf8"),
        "en-US": fs.readFileSync(path.join(VENDOR, "locales-en-US.xml"), "utf8"),
      },
      styleInfo: {
        id: /<id>([^<]+)<\/id>/.exec(style)?.[1] ?? "?",
        updated: /<updated>([^<]+)<\/updated>/.exec(style)?.[1] ?? "?",
        sha256: crypto.createHash("sha256").update(style).digest("hex"),
        engine: `citeproc-js ${(CSL as { PROCESSOR_VERSION?: string }).PROCESSOR_VERSION ?? "?"}`,
      },
    };
  }
  return cache;
}

export const styleInfo = () => assets().styleInfo;

export interface CslName {
  family?: string;
  given?: string;
  "non-dropping-particle"?: string;
  suffix?: string;
  literal?: string;
}

export interface CslItem {
  id: string;
  type: string;
  title?: string;
  author?: CslName[];
  editor?: CslName[];
  [k: string]: unknown;
}

export interface PersonalCommForRender {
  id: string;
  given_initials: string;
  family: string;
  communication_date: string; // AAAA-MM-DD
}

export interface RenderInput {
  locale: CitationLocale;
  items: Map<string, CslItem>;
  /** Siglas de autores institucionais: id da referência → { nome completo, sigla } */
  abbreviations?: Map<string, { literal: string; abbr: string }>;
  personal?: Map<string, PersonalCommForRender>;
  citations: CitationAttrs[]; // por ordem do documento
}

export interface RenderedCitation {
  html: string;
  text: string;
  warnings: string[];
}

export interface RenderOutput {
  citations: Record<string, RenderedCitation>;
  bibliography: { id: string; html: string; text: string }[];
  style: StyleInfo;
}

const TERMS = {
  "pt-PT": {
    and: "e",
    asCitedIn: "como citado em",
    personal: "comunicação pessoal",
    months: ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"],
    date: (d: number, m: string, y: number) => `${d} de ${m} de ${y}`,
    noDate: "s.d.",
  },
  "en-US": {
    and: "and",
    asCitedIn: "as cited in",
    personal: "personal communication",
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    date: (d: number, m: string, y: number) => `${m} ${d}, ${y}`,
    noDate: "n.d.",
  },
} as const;

export function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#60;|&lt;/g, "<")
    .replace(/&#62;|&gt;/g, ">")
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

const escapeHtml = (s: string) => s.replace(/&/g, "&#38;").replace(/</g, "&#60;").replace(/>/g, "&#62;");

/** Narrativa APA: o nome dos autores usa "e"/"and" por extenso em vez de "&". */
export function narrativeAnd(authorHtml: string, locale: CitationLocale): string {
  const amp = "(?:&#38;|&amp;|&)";
  if (locale === "pt-PT") return authorHtml.replace(new RegExp(`,? ${amp} `, "g"), " e ");
  return authorHtml
    .replace(new RegExp(`, ${amp} `, "g"), ", and ")
    .replace(new RegExp(` ${amp} `, "g"), " and ");
}

const stripParens = (h: string) => h.replace(/^\(/, "").replace(/\)$/, "");

function cslItem(it: CitationItemAttrs, extra: Record<string, unknown> = {}) {
  const o: Record<string, unknown> = { id: it.referenceId, ...extra };
  if (it.locator) {
    o.locator = it.locator;
    o.label = it.locatorLabel ?? "page";
  }
  if (it.prefix) o.prefix = it.prefix.endsWith(" ") ? it.prefix : it.prefix + " ";
  if (it.suffix) o.suffix = it.suffix.startsWith(",") || it.suffix.startsWith(" ") ? it.suffix : ", " + it.suffix;
  return o;
}

export function renderCitations(input: RenderInput): RenderOutput {
  const { style, locales } = assets();
  const t = TERMS[input.locale];
  const out: Record<string, RenderedCitation> = {};
  const warnings = new Map<string, string[]>();
  const warn = (id: string, w: string) => warnings.set(id, [...(warnings.get(id) ?? []), w]);

  // 1) Obras citadas (referências existentes)
  const cited: string[] = [];
  for (const c of input.citations) {
    for (const it of c.items) {
      if (!it.referenceId) continue;
      if (!input.items.has(it.referenceId)) warn(c.id, "Fonte inexistente ou arquivada.");
      else if (!cited.includes(it.referenceId)) cited.push(it.referenceId);
    }
  }

  const sys = {
    retrieveLocale: (lang: string) => locales[lang] ?? locales["en-US"],
    retrieveItem: (id: string) => input.items.get(id),
  };
  const engine = new CSL.Engine(sys, style, input.locale, true);
  engine.setOutputFormat("html");
  engine.updateItems(cited);

  // 2) Ordem da lista de referências (APA: várias obras no mesmo parêntese seguem essa ordem)
  const order = new Map<string, number>();
  if (cited.length) {
    const [meta] = engine.makeBibliography();
    (meta.entry_ids as string[][]).forEach((ids, i) => order.set(String(ids[0]), i));
  }
  const byOrder = (a: CitationItemAttrs, b: CitationItemAttrs) =>
    (order.get(a.referenceId ?? "") ?? 1e9) - (order.get(b.referenceId ?? "") ?? 1e9);

  // 3) Construir clusters CSL
  type Cluster = { citationID: string; citationItems: Record<string, unknown>[]; properties: { noteIndex: number } };
  const clusters: Cluster[] = [];
  const valid = (c: CitationAttrs) => c.items.filter((i) => i.referenceId && input.items.has(i.referenceId));
  for (const c of input.citations) {
    const items = valid(c).sort(byOrder);
    if (c.mode === "personal" || items.length === 0) continue;
    if (c.mode === "narrative") {
      clusters.push({ citationID: `${c.id}#a`, citationItems: [{ id: items[0]!.referenceId, "author-only": true }], properties: { noteIndex: 0 } });
      clusters.push({
        citationID: `${c.id}#s`,
        citationItems: items.map((i) => cslItem(i, { "suppress-author": true })),
        properties: { noteIndex: 0 },
      });
      // Verificação: todas as obras de uma narrativa devem ter os mesmos autores
      items.slice(1).forEach((i, k) =>
        clusters.push({ citationID: `${c.id}#chk${k}`, citationItems: [{ id: i.referenceId, "author-only": true }], properties: { noteIndex: 0 } }),
      );
    } else {
      clusters.push({ citationID: `${c.id}#p`, citationItems: items.map((i) => cslItem(i)), properties: { noteIndex: 0 } });
    }
  }
  const rendered = new Map<string, string>();
  if (clusters.length) {
    for (const [cid, , html] of engine.rebuildProcessorState(clusters, "html") as [string, number, string][]) rendered.set(cid, html);
  }

  // 4) Composição final, siglas institucionais (1.ª ocorrência: nome [SIGLA]; seguintes: SIGLA)
  const abbrSeen = new Set<string>();
  const applyAbbr = (html: string, c: CitationAttrs, narrativeAuthor: boolean): string => {
    let h = html;
    for (const it of c.items) {
      const ab = it.referenceId ? input.abbreviations?.get(it.referenceId) : undefined;
      if (!ab) continue;
      const lit = escapeHtml(ab.literal);
      if (!h.includes(lit) && !h.includes(ab.literal)) continue;
      const first = !abbrSeen.has(ab.literal);
      if (!narrativeAuthor) {
        h = h.replace(lit, first ? `${lit} [${escapeHtml(ab.abbr)}]` : escapeHtml(ab.abbr));
        abbrSeen.add(ab.literal);
      } else if (!first) {
        h = h.replace(lit, escapeHtml(ab.abbr));
      }
    }
    return h;
  };

  for (const c of input.citations) {
    const items = valid(c);
    let html = "";
    if (c.mode === "personal") {
      const parts = c.items.map((it) => {
        const p = it.personalId ? input.personal?.get(it.personalId) : undefined;
        if (!p) {
          warn(c.id, "Comunicação pessoal inexistente.");
          return null;
        }
        const [y, m, d] = p.communication_date.split("-").map(Number) as [number, number, number];
        const date = t.date(d, t.months[m - 1]!, y);
        return { name: `${p.given_initials.trim()} ${p.family.trim()}`, date };
      });
      const ok = parts.filter((p): p is { name: string; date: string } => !!p);
      if (ok.length) {
        html = c.narrative
          ? ok.map((p) => `${escapeHtml(p.name)} (${t.personal}, ${p.date})`).join("; ")
          : `(${ok.map((p) => `${escapeHtml(p.name)}, ${t.personal}, ${p.date}`).join("; ")})`;
      }
    } else if (items.length === 0) {
      html = "";
    } else if (c.mode === "narrative") {
      const authorHtml = rendered.get(`${c.id}#a`) ?? "";
      const rest = rendered.get(`${c.id}#s`) ?? "";
      if (items.slice(1).some((_, k) => rendered.get(`${c.id}#chk${k}`) !== authorHtml)) {
        warn(c.id, "Narrativa com autores diferentes: insira cada obra individualmente.");
      }
      let author = narrativeAnd(authorHtml, input.locale);
      const ab = input.abbreviations?.get(items[0]!.referenceId!);
      let restH = rest;
      if (ab) {
        const first = !abbrSeen.has(ab.literal);
        if (first) restH = rest.replace(/^\(/, `(${escapeHtml(ab.abbr)}, `);
        else author = author.replace(escapeHtml(ab.literal), escapeHtml(ab.abbr)).replace(ab.literal, escapeHtml(ab.abbr));
        abbrSeen.add(ab.literal);
      }
      html = `${author} ${restH}`;
    } else if (c.mode === "secondary") {
      const consulted = stripParens(applyAbbr(rendered.get(`${c.id}#p`) ?? "", c, false));
      const orig = (c.secondaryAuthor ?? "").trim();
      const year = (c.secondaryYear ?? "").trim();
      if (!orig) warn(c.id, "Indique o autor da obra original mencionada.");
      const origEsc = escapeHtml(orig);
      html = c.narrative
        ? `${origEsc} (${year ? escapeHtml(year) + ", " : ""}${t.asCitedIn} ${consulted})`
        : `(${origEsc}${year ? ", " + escapeHtml(year) : ""}, ${t.asCitedIn} ${consulted})`;
    } else {
      html = applyAbbr(rendered.get(`${c.id}#p`) ?? "", c, false);
      if ((c.mode === "quote_short" || c.mode === "quote_block") && !c.items.some((i) => i.locator)) {
        warn(c.id, "Citação direta sem localizador (página, parágrafo, secção ou tempo).");
      }
    }
    if (!html) html = "[citação por resolver]";
    out[c.id] = { html, text: htmlToText(html), warnings: warnings.get(c.id) ?? [] };
  }

  // 5) Bibliografia apenas com obras citadas no escopo (comunicações pessoais excluídas)
  let bibliography: RenderOutput["bibliography"] = [];
  if (cited.length) {
    const [meta, entries] = engine.makeBibliography();
    bibliography = (entries as string[]).map((e, i) => {
      const inner = e.trim().replace(/^<div class="csl-entry">/, "").replace(/<\/div>$/, "");
      return { id: String((meta.entry_ids as string[][])[i]![0]), html: inner, text: htmlToText(inner) };
    });
  }
  return { citations: out, bibliography, style: styleInfo() };
}

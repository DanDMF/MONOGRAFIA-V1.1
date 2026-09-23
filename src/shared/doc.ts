// Documento estruturado das secções (JSON compatível com ProseMirror/TipTap).
// O servidor valida/sanitiza com uma lista explícita de nós, marcas e atributos; nunca guarda HTML solto.

export interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export type CitationMode = "narrative" | "parenthetical" | "quote_short" | "quote_block" | "secondary" | "personal";

export interface CitationItemAttrs {
  referenceId?: string | null;
  personalId?: string | null;
  locatorLabel?: string | null;
  locator?: string | null;
  prefix?: string | null;
  suffix?: string | null;
}

export interface CitationAttrs {
  id: string;
  mode: CitationMode;
  items: CitationItemAttrs[];
  quote?: string | null; // citação direta curta (texto entre aspas)
  secondaryAuthor?: string | null; // obra original mencionada (fonte secundária)
  secondaryYear?: string | null;
  narrative?: boolean | null; // fonte secundária / comunicação pessoal em forma narrativa
  excerptId?: string | null;
}

export interface XrefAttrs {
  id: string;
  targetType: "section" | "table" | "figure" | "equation" | "appendix";
  targetId: string;
}

export const LOCATOR_LABELS = ["page", "paragraph", "section", "timestamp", "figure", "table", "chapter"] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TEXT = 200_000;

export class DocValidationError extends Error {}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "horizontalRule",
  "citationBlock",
]);
const INLINE_TYPES = new Set(["text", "hardBreak", "citation", "xref"]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "link", "code", "subscript", "superscript"]);

const str = (v: unknown, max = 2000): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string") throw new DocValidationError("Atributo de texto inválido.");
  if (v.length > max) throw new DocValidationError("Atributo demasiado longo.");
  return v;
};

function sanitizeCitation(a: Record<string, unknown> | undefined): CitationAttrs {
  if (!a) throw new DocValidationError("Citação sem atributos.");
  const id = str(a.id, 64);
  if (!id || !UUID_RE.test(id)) throw new DocValidationError("Citação sem identificador válido.");
  const modes: CitationMode[] = ["narrative", "parenthetical", "quote_short", "quote_block", "secondary", "personal"];
  const mode = a.mode as CitationMode;
  if (!modes.includes(mode)) throw new DocValidationError("Modalidade de citação inválida.");
  if (!Array.isArray(a.items) || a.items.length === 0 || a.items.length > 30)
    throw new DocValidationError("Citação sem fontes.");
  const items: CitationItemAttrs[] = a.items.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const referenceId = str(it.referenceId, 64);
    const personalId = str(it.personalId, 64);
    if ((referenceId ? 1 : 0) + (personalId ? 1 : 0) !== 1) throw new DocValidationError("Item de citação inválido.");
    for (const x of [referenceId, personalId]) if (x && !UUID_RE.test(x)) throw new DocValidationError("ID inválido.");
    const locatorLabel = str(it.locatorLabel, 20);
    if (locatorLabel && !(LOCATOR_LABELS as readonly string[]).includes(locatorLabel))
      throw new DocValidationError("Tipo de localizador inválido.");
    return {
      referenceId,
      personalId,
      locatorLabel,
      locator: str(it.locator, 100),
      prefix: str(it.prefix, 200),
      suffix: str(it.suffix, 200),
    };
  });
  if (mode === "personal" && items.some((i) => !i.personalId))
    throw new DocValidationError("Comunicação pessoal deve apontar para um registo de comunicação pessoal.");
  if (mode !== "personal" && items.some((i) => i.personalId))
    throw new DocValidationError("Comunicações pessoais usam a modalidade própria.");
  const excerptId = str(a.excerptId, 64);
  if (excerptId && !UUID_RE.test(excerptId)) throw new DocValidationError("Excerto inválido.");
  return {
    id,
    mode,
    items,
    quote: str(a.quote, 5000),
    secondaryAuthor: str(a.secondaryAuthor, 300),
    secondaryYear: str(a.secondaryYear, 20),
    narrative: a.narrative === true,
    excerptId,
  };
}

function sanitizeMarks(marks: DocNode["marks"]): DocNode["marks"] {
  if (!marks) return undefined;
  const out: NonNullable<DocNode["marks"]> = [];
  for (const m of marks) {
    if (!MARKS.has(m.type)) continue; // marcas desconhecidas são descartadas (apresentação apenas)
    if (m.type === "link") {
      const href = str(m.attrs?.href, 2000);
      if (!href || !/^(https?:\/\/|mailto:)/i.test(href)) continue;
      out.push({ type: "link", attrs: { href } });
    } else out.push({ type: m.type });
  }
  return out.length ? out : undefined;
}

/** Valida e devolve uma cópia limpa do documento. Lança DocValidationError. */
export function sanitizeDoc(input: unknown): DocNode {
  let budget = MAX_TEXT;
  const walk = (n: unknown, depth: number): DocNode => {
    if (depth > 30) throw new DocValidationError("Documento demasiado profundo.");
    if (!n || typeof n !== "object") throw new DocValidationError("Nó inválido.");
    const node = n as DocNode;
    const t = node.type;
    if (t === "text") {
      if (typeof node.text !== "string" || node.text.length === 0) throw new DocValidationError("Texto inválido.");
      budget -= node.text.length;
      if (budget < 0) throw new DocValidationError("Secção demasiado longa.");
      return { type: "text", text: node.text, ...(sanitizeMarks(node.marks) ? { marks: sanitizeMarks(node.marks) } : {}) };
    }
    if (!BLOCK_TYPES.has(t) && !INLINE_TYPES.has(t) && t !== "doc") throw new DocValidationError(`Tipo de nó não suportado: ${t}`);
    const out: DocNode = { type: t };
    if (t === "heading") {
      const level = Number(node.attrs?.level);
      out.attrs = { level: level >= 2 && level <= 5 ? level : 2 };
    } else if (t === "orderedList") {
      const start = Number(node.attrs?.start ?? 1);
      out.attrs = { start: Number.isInteger(start) && start > 0 ? start : 1 };
    } else if (t === "citation" || t === "citationBlock") {
      out.attrs = sanitizeCitation(node.attrs) as unknown as Record<string, unknown>;
      const mode = (out.attrs as unknown as CitationAttrs).mode;
      if (t === "citationBlock" && mode !== "quote_block") throw new DocValidationError("Bloco de citação com modalidade inválida.");
      if (t === "citation" && mode === "quote_block") throw new DocValidationError("Citação em bloco deve ser um bloco.");
    } else if (t === "xref") {
      const a = node.attrs ?? {};
      const id = str(a.id, 64);
      const targetId = str(a.targetId, 64);
      const targetType = a.targetType;
      if (!id || !targetId || !UUID_RE.test(id) || !UUID_RE.test(targetId)) throw new DocValidationError("Referência cruzada inválida.");
      if (!["section", "table", "figure", "equation", "appendix"].includes(String(targetType)))
        throw new DocValidationError("Tipo de referência cruzada inválido.");
      out.attrs = { id, targetId, targetType };
    }
    if (Array.isArray(node.content)) {
      if (t === "citation" || t === "xref" || t === "hardBreak" || t === "horizontalRule")
        throw new DocValidationError(`${t} não pode ter conteúdo.`);
      out.content = node.content.map((c) => walk(c, depth + 1));
    }
    return out;
  };
  const doc = walk(input, 0);
  if (doc.type !== "doc") throw new DocValidationError("A raiz deve ser 'doc'.");
  if (!doc.content || doc.content.length === 0) doc.content = [{ type: "paragraph" }];
  // Identificadores de citação/xref únicos no documento
  const seen = new Set<string>();
  visit(doc, (n) => {
    if (n.type === "citation" || n.type === "citationBlock" || n.type === "xref") {
      const id = String(n.attrs?.id);
      if (seen.has(id)) throw new DocValidationError("Identificador duplicado no documento (copie a citação com 'Inserir citação').");
      seen.add(id);
    }
  });
  return doc;
}

export function visit(n: DocNode, fn: (n: DocNode, parent: DocNode | null) => void, parent: DocNode | null = null): void {
  fn(n, parent);
  for (const c of n.content ?? []) visit(c, fn, n);
}

/** Conta palavras de um texto (sequências separadas por espaço que contêm letra ou dígito). */
export function countWords(text: string): number {
  return text.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Texto simples de um nó (sem citações renderizadas). */
export function plainText(n: DocNode): string {
  if (n.type === "text") return n.text ?? "";
  if (n.type === "hardBreak") return "\n";
  if (n.type === "citation") return (n.attrs as unknown as CitationAttrs).quote ?? "";
  const parts = (n.content ?? []).map(plainText);
  return BLOCK_TYPES.has(n.type) || n.type === "doc" ? parts.join(" ") + " " : parts.join("");
}

/** Contagem de palavras da secção: texto do autor e citações diretas (excluindo referências). */
export function docWordCount(doc: DocNode): number {
  return countWords(plainText(doc));
}

export function extractCitations(doc: DocNode): CitationAttrs[] {
  const out: CitationAttrs[] = [];
  visit(doc, (n) => {
    if (n.type === "citation") out.push(n.attrs as unknown as CitationAttrs);
    if (n.type === "citationBlock") {
      const a = { ...(n.attrs as unknown as CitationAttrs) };
      a.quote = plainText(n).trim();
      out.push(a);
    }
  });
  return out;
}

export function extractXrefs(doc: DocNode): XrefAttrs[] {
  const out: XrefAttrs[] = [];
  visit(doc, (n) => {
    if (n.type === "xref") out.push(n.attrs as unknown as XrefAttrs);
  });
  return out;
}

/** Limite APA: 40 palavras ou mais → citação em bloco. */
export const BLOCK_QUOTE_MIN_WORDS = 40;
export function quoteNeedsBlock(text: string): boolean {
  return countWords(text) >= BLOCK_QUOTE_MIN_WORDS;
}

// ---------- Conversão para HTML (pré-visualização e publicação) ----------

export interface RenderContext {
  citationHtml: (id: string) => string | undefined;
  xrefLabel: (x: XrefAttrs) => { label: string; href?: string } | undefined;
  quoteOpen?: string;
  quoteClose?: string;
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderMarks(text: string, marks: DocNode["marks"]): string {
  let h = escapeHtml(text);
  for (const m of marks ?? []) {
    switch (m.type) {
      case "bold":
        h = `<strong>${h}</strong>`;
        break;
      case "italic":
        h = `<em>${h}</em>`;
        break;
      case "underline":
        h = `<u>${h}</u>`;
        break;
      case "strike":
        h = `<s>${h}</s>`;
        break;
      case "code":
        h = `<code>${h}</code>`;
        break;
      case "subscript":
        h = `<sub>${h}</sub>`;
        break;
      case "superscript":
        h = `<sup>${h}</sup>`;
        break;
      case "link":
        h = `<a href="${escapeHtml(String(m.attrs?.href ?? ""))}" rel="noopener noreferrer">${h}</a>`;
        break;
    }
  }
  return h;
}

export function docToHtml(doc: DocNode, ctx: RenderContext): string {
  const qo = ctx.quoteOpen ?? "“";
  const qc = ctx.quoteClose ?? "”";
  const r = (n: DocNode): string => {
    const inner = () => (n.content ?? []).map(r).join("");
    switch (n.type) {
      case "doc":
        return inner();
      case "text":
        return renderMarks(n.text ?? "", n.marks);
      case "paragraph":
        return `<p>${inner()}</p>`;
      case "heading": {
        const lvl = Math.min(6, Number(n.attrs?.level ?? 2) + 1); // h1 reservado ao título da secção
        return `<h${lvl}>${inner()}</h${lvl}>`;
      }
      case "bulletList":
        return `<ul>${inner()}</ul>`;
      case "orderedList":
        return `<ol start="${Number(n.attrs?.start ?? 1)}">${inner()}</ol>`;
      case "listItem":
        return `<li>${inner()}</li>`;
      case "blockquote":
        return `<blockquote>${inner()}</blockquote>`;
      case "horizontalRule":
        return "<hr>";
      case "hardBreak":
        return "<br>";
      case "citation": {
        const a = n.attrs as unknown as CitationAttrs;
        const c = ctx.citationHtml(a.id) ?? '<span class="cite-missing">[citação por resolver]</span>';
        if (a.mode === "quote_short" && a.quote)
          return `${qo}${escapeHtml(a.quote)}${qc} <span class="cite" data-citation="${a.id}">${c}</span>`;
        return `<span class="cite" data-citation="${a.id}">${c}</span>`;
      }
      case "citationBlock": {
        const a = n.attrs as unknown as CitationAttrs;
        const c = ctx.citationHtml(a.id) ?? "[citação por resolver]";
        // APA: em bloco, o parêntese vem depois da pontuação final, sem aspas externas.
        const paras = (n.content ?? []).map(r);
        const last = paras.pop() ?? "<p></p>";
        const lastWith = last.replace(/<\/p>$/, ` <span class="cite" data-citation="${a.id}">${c}</span></p>`);
        return `<blockquote class="apa-block-quote">${paras.join("")}${lastWith}</blockquote>`;
      }
      case "xref": {
        const a = n.attrs as unknown as XrefAttrs;
        const x = ctx.xrefLabel(a);
        if (!x) return '<span class="xref-missing">[referência cruzada por resolver]</span>';
        return x.href ? `<a class="xref" href="${escapeHtml(x.href)}">${escapeHtml(x.label)}</a>` : escapeHtml(x.label);
      }
      default:
        return "";
    }
  };
  return r(doc);
}

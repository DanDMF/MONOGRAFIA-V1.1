// Documento académico DOCX (perfil APA 7 de estudante) a partir do conteúdo estruturado.
// Estilos reais Heading 1–5 (níveis APA), sumário atualizável (campo TOC), citações renderizadas pelo motor CSL,
// bibliografia com recuo francês 1,27 cm, espaçamento duplo, margens 2,54 cm, paginação no canto superior direito.
// Contrato e limitações: docs/EXPORTS.md.
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TableOfContents,
  TextRun,
  type IParagraphOptions,
  type ParagraphChild,
} from "docx";
import type { CitationAttrs, DocNode, XrefAttrs } from "../../../shared/doc.js";

export interface AcademicSection {
  id: string;
  number: string | null;
  title: string;
  kind: string;
  depth: number;
  template_key?: string | null;
  doc: DocNode | null; // null = só título (antepassado de secção incluída)
}

export interface AcademicDocInput {
  locale: "pt-PT" | "en-US";
  project: {
    name: string;
    academic_title: string | null;
    author_name: string | null;
    institution: string | null;
    degree: string | null;
    advisor: string | null;
    academic_year: string | null;
  };
  sections: AcademicSection[];
  citations: Record<string, { html: string; text: string }>;
  bibliography: { id: string; html: string }[];
  xrefLabel: (x: XrefAttrs) => string | null;
  origin: string; // ex.: "Publicação v2 (2026-09-23)" ou "Rascunho de 2026-09-23 10:00"
  options: { titlePage: boolean; toc: boolean; numberHeadings: boolean };
}

// Medidas em twips (1 cm ≈ 567; 1 pol = 1440)
const MARGIN = 1440; // 2,54 cm
const INDENT = 720; // 1,27 cm
const LINE_DOUBLE = 480;
const FONT = "Times New Roman"; // o LibreOffice substitui por Liberation Serif (métricas compatíveis)
const SIZE = 24; // 12 pt

const T = {
  "pt-PT": { toc: "Índice", references: "Referências", generated: "Documento gerado a partir de" },
  "en-US": { toc: "Contents", references: "References", generated: "Document generated from" },
};

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  superScript?: boolean;
  subScript?: boolean;
  code?: boolean;
}

function decode(s: string) {
  return s
    .replace(/&#38;|&amp;/g, "&")
    .replace(/&#60;|&lt;/g, "<")
    .replace(/&#62;|&gt;/g, ">")
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function run(text: string, st: RunStyle = {}): TextRun {
  return new TextRun({
    text,
    bold: st.bold,
    italics: st.italics,
    underline: st.underline ? {} : undefined,
    strike: st.strike,
    superScript: st.superScript,
    subScript: st.subScript,
    font: st.code ? "Courier New" : undefined,
  });
}

/** Converte o HTML simples do citeproc (i, b, sup, sub, span, div, a) em runs com formatação. */
export function htmlToRuns(html: string, base: RunStyle = {}): TextRun[] {
  const out: TextRun[] = [];
  const stack: RunStyle[] = [base];
  const re = /<\/?([a-z0-9]+)[^>]*>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[2] !== undefined) {
      const text = decode(m[2]);
      if (text) out.push(run(text, stack[stack.length - 1]));
      continue;
    }
    const tag = m[1]!.toLowerCase();
    const closing = m[0].startsWith("</");
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (m[0].endsWith("/>") || tag === "br") continue;
    const cur = { ...stack[stack.length - 1] };
    if (tag === "i" || tag === "em") cur.italics = !cur.italics;
    if (tag === "b" || tag === "strong") cur.bold = true;
    if (tag === "sup") cur.superScript = true;
    if (tag === "sub") cur.subScript = true;
    if (/font-style:\s*normal/.test(m[0])) cur.italics = false;
    stack.push(cur);
  }
  return out;
}

function marksToStyle(marks: DocNode["marks"], base: RunStyle = {}): RunStyle {
  const st: RunStyle = { ...base };
  for (const mk of marks ?? []) {
    if (mk.type === "bold") st.bold = true;
    if (mk.type === "italic") st.italics = !st.italics;
    if (mk.type === "underline") st.underline = true;
    if (mk.type === "strike") st.strike = true;
    if (mk.type === "superscript") st.superScript = true;
    if (mk.type === "subscript") st.subScript = true;
    if (mk.type === "code") st.code = true;
  }
  return st;
}

export function buildAcademicDocx(input: AcademicDocInput): Promise<Buffer> {
  const t = T[input.locale];
  const cite = (id: string) => input.citations[id]?.html ?? "[citação por resolver]";
  const children: Paragraph[] = [];
  const quoteO = "“";
  const quoteC = "”";

  // ---- conteúdo inline
  const inline = (nodes: DocNode[] | undefined, base: RunStyle = {}): ParagraphChild[] => {
    const out: ParagraphChild[] = [];
    for (const n of nodes ?? []) {
      if (n.type === "text") {
        const st = marksToStyle(n.marks, base);
        const link = n.marks?.find((m) => m.type === "link")?.attrs?.href as string | undefined;
        if (link) out.push(new ExternalHyperlink({ link, children: [new TextRun({ text: n.text ?? "", style: "Hyperlink", bold: st.bold, italics: st.italics })] }));
        else out.push(run(n.text ?? "", st));
      } else if (n.type === "hardBreak") {
        out.push(new TextRun({ break: 1 }));
      } else if (n.type === "citation") {
        const a = n.attrs as unknown as CitationAttrs;
        if (a.mode === "quote_short" && a.quote) out.push(run(`${quoteO}${a.quote}${quoteC} `, base));
        out.push(...htmlToRuns(cite(a.id), base));
      } else if (n.type === "xref") {
        out.push(run(input.xrefLabel(n.attrs as unknown as XrefAttrs) ?? "[referência cruzada por resolver]", base));
      }
    }
    return out;
  };

  // ---- títulos APA (1: centrado negrito; 2: esquerda negrito; 3: esquerda negrito itálico; 4/5: em linha)
  const headingParagraph = (level: number, text: string): Paragraph =>
    new Paragraph({ style: `Heading${Math.min(3, level)}`, children: [run(text)], keepNext: true });

  const body = (doc: DocNode, baseLevel: number) => {
    const blocks = doc.content ?? [];
    let runIn: { level: number; text: string } | null = null;
    const para = (opts: IParagraphOptions) => children.push(new Paragraph(opts));
    const walkList = (list: DocNode, ordered: boolean, level: number) => {
      for (const item of list.content ?? []) {
        for (const c of item.content ?? []) {
          if (c.type === "paragraph") {
            para({ children: inline(c.content), numbering: { reference: ordered ? "ordered" : "bullets", level: Math.min(level, 2) }, style: "ListBody" });
          } else if (c.type === "bulletList" || c.type === "orderedList") {
            walkList(c, c.type === "orderedList", level + 1);
          }
        }
      }
    };
    for (const b of blocks) {
      switch (b.type) {
        case "heading": {
          // O primeiro nível de título do editor (T2) fica um nível abaixo do título da secção.
          const lvl = Math.min(5, baseLevel + Number(b.attrs?.level ?? 2) - 2);
          const text = (b.content ?? []).map((x) => x.text ?? "").join("");
          if (lvl >= 4) runIn = { level: lvl, text };
          else children.push(headingParagraph(lvl, text));
          break;
        }
        case "paragraph": {
          const kids = inline(b.content);
          if (runIn) {
            const r = runIn as { level: number; text: string };
            const head = run(r.text.replace(/\.?$/, ". "), { bold: true, italics: r.level === 5 });
            para({ style: "Body", children: [head, ...kids] });
            runIn = null;
          } else if (kids.length) {
            para({ style: "Body", children: kids });
          }
          break;
        }
        case "bulletList":
        case "orderedList":
          walkList(b, b.type === "orderedList", 0);
          break;
        case "blockquote":
          for (const c of b.content ?? []) if (c.type === "paragraph") para({ style: "BlockQuote", children: inline(c.content) });
          break;
        case "citationBlock": {
          const a = b.attrs as unknown as CitationAttrs;
          const ps = (b.content ?? []).filter((c) => c.type === "paragraph");
          ps.forEach((c, i) => {
            const kids = inline(c.content);
            if (i === ps.length - 1) kids.push(run(" "), ...htmlToRuns(cite(a.id)));
            para({ style: "BlockQuote", children: kids });
          });
          break;
        }
        case "horizontalRule":
          break;
      }
    }
    if (runIn) {
      const r = runIn as { level: number; text: string };
      para({ style: "Body", children: [run(r.text.replace(/\.?$/, "."), { bold: true, italics: r.level === 5 })] });
    }
  };

  // ---- página de título (APA estudante: elementos presentes apenas)
  const p = input.project;
  if (input.options.titlePage) {
    for (let i = 0; i < 3; i++) children.push(new Paragraph({ style: "TitleLine", children: [] }));
    children.push(new Paragraph({ style: "TitleLine", children: [run(p.academic_title || p.name, { bold: true })] }));
    children.push(new Paragraph({ style: "TitleLine", children: [] }));
    for (const line of [p.author_name, p.institution, p.degree, p.advisor, p.academic_year]) {
      if (line) children.push(new Paragraph({ style: "TitleLine", children: [run(line)] }));
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }
  if (input.options.toc) {
    children.push(new Paragraph({ style: "TocHeading", children: [run(t.toc, { bold: true })] }));
    children.push(new TableOfContents(t.toc, { hyperlink: true, headingStyleRange: "1-3" }) as unknown as Paragraph);
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  // ---- corpo
  let bibliographyPlaced = false;
  let first = true;
  const bibliographyBlock = () => {
    children.push(new Paragraph({ style: "Heading1", pageBreakBefore: true, children: [run(t.references)] }));
    for (const e of input.bibliography) children.push(new Paragraph({ style: "Reference", children: htmlToRuns(e.html) }));
    bibliographyPlaced = true;
  };
  for (const s of input.sections) {
    if (s.template_key === "references") {
      if (input.bibliography.length) bibliographyBlock();
      continue;
    }
    const level = Math.min(5, s.depth + 1);
    const label = input.options.numberHeadings && s.number ? `${s.number} ${s.title}` : s.title;
    if (level === 1) {
      children.push(new Paragraph({ style: "Heading1", pageBreakBefore: !first, children: [run(label)] }));
    } else if (level <= 3) {
      children.push(headingParagraph(level, label));
    } else {
      children.push(new Paragraph({ style: "Body", children: [run(label.replace(/\.?$/, "."), { bold: true, italics: level === 5 })] }));
    }
    first = false;
    if (s.doc) body(s.doc, level + 1);
  }
  if (!bibliographyPlaced && input.bibliography.length) bibliographyBlock();

  const doc = new Document({
    creator: p.author_name ?? undefined,
    title: p.academic_title ?? p.name,
    description: `${t.generated} ${input.origin}`,
    features: { updateFields: input.options.toc },
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE }, paragraph: { spacing: { line: LINE_DOUBLE, before: 0, after: 0 } } },
      },
      paragraphStyles: [
        { id: "Body", name: "Corpo APA", basedOn: "Normal", quickFormat: true, paragraph: { indent: { firstLine: INDENT }, spacing: { line: LINE_DOUBLE } } },
        { id: "ListBody", name: "Lista APA", basedOn: "Normal", paragraph: { spacing: { line: LINE_DOUBLE } } },
        { id: "BlockQuote", name: "Citação em bloco APA", basedOn: "Normal", paragraph: { indent: { left: INDENT }, spacing: { line: LINE_DOUBLE } } },
        { id: "Reference", name: "Referência APA", basedOn: "Normal", paragraph: { indent: { left: INDENT, hanging: INDENT }, spacing: { line: LINE_DOUBLE } } },
        { id: "TitleLine", name: "Linha de título", basedOn: "Normal", paragraph: { alignment: AlignmentType.CENTER, spacing: { line: LINE_DOUBLE } } },
        { id: "TocHeading", name: "Título do índice", basedOn: "Normal", paragraph: { alignment: AlignmentType.CENTER, spacing: { line: LINE_DOUBLE } } },
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Body",
          quickFormat: true,
          run: { bold: true, font: FONT, size: SIZE, color: "000000" },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { line: LINE_DOUBLE, before: 0, after: 0 }, keepNext: true, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Body",
          quickFormat: true,
          run: { bold: true, font: FONT, size: SIZE, color: "000000" },
          paragraph: { alignment: AlignmentType.LEFT, spacing: { line: LINE_DOUBLE }, keepNext: true, outlineLevel: 1 },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Body",
          quickFormat: true,
          run: { bold: true, italics: true, font: FONT, size: SIZE, color: "000000" },
          paragraph: { alignment: AlignmentType.LEFT, spacing: { line: LINE_DOUBLE }, keepNext: true, outlineLevel: 2 },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.BULLET,
            text: level === 1 ? "◦" : "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: INDENT * (level + 1), hanging: 360 } } },
          })),
        },
        {
          reference: "ordered",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: level === 1 ? LevelFormat.LOWER_LETTER : LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: INDENT * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 (perfil institucional pode alterar)
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN, header: 720, footer: 720 },
          },
        },
        headers: {
          default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }),
        },
        footers: { default: new Footer({ children: [] }) },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

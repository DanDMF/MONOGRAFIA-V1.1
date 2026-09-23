// Documento estruturado: sanitização, HTML seguro, citações e referências cruzadas.
import { describe, expect, it } from "vitest";
import { DocValidationError, docToHtml, extractCitations, sanitizeDoc } from "../src/shared/doc.js";
import { computeNumbering } from "../src/shared/templates.js";
import { diffWords } from "../src/shared/diff.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const para = (...content: unknown[]) => ({ type: "paragraph", content });

describe("sanitizeDoc", () => {
  it("remove ligações javascript: e marcas desconhecidas; limita níveis de título", () => {
    const d = sanitizeDoc({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 9 }, content: [{ type: "text", text: "T" }] },
        para({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "evil" }, { type: "bold" }] }),
      ],
    });
    expect(d.content![0]!.attrs).toEqual({ level: 2 });
    expect(d.content![1]!.content![0]!.marks).toEqual([{ type: "bold" }]);
  });
  it("recusa tipos de nó não suportados e IDs de citação duplicados", () => {
    expect(() => sanitizeDoc({ type: "doc", content: [{ type: "iframe" }] })).toThrow(DocValidationError);
    const c = { type: "citation", attrs: { id: id(1), mode: "parenthetical", items: [{ referenceId: id(2) }] } };
    expect(() => sanitizeDoc({ type: "doc", content: [para(c, c)] })).toThrow(/duplicado/);
  });
  it("citação em bloco só como bloco; comunicação pessoal só com registo próprio", () => {
    expect(() =>
      sanitizeDoc({ type: "doc", content: [para({ type: "citation", attrs: { id: id(3), mode: "quote_block", items: [{ referenceId: id(2) }] } })] }),
    ).toThrow();
    expect(() =>
      sanitizeDoc({ type: "doc", content: [para({ type: "citation", attrs: { id: id(4), mode: "personal", items: [{ referenceId: id(2) }] } })] }),
    ).toThrow();
  });
  it("extrai o texto das citações em bloco para contagem e índice", () => {
    const d = sanitizeDoc({
      type: "doc",
      content: [{ type: "citationBlock", attrs: { id: id(5), mode: "quote_block", items: [{ referenceId: id(2), locator: "3" }] }, content: [para({ type: "text", text: "Texto longo." })] }],
    });
    expect(extractCitations(d)[0]!.quote).toBe("Texto longo.");
  });
});

describe("docToHtml", () => {
  it("escapa HTML do utilizador e resolve citações e referências cruzadas", () => {
    const d = sanitizeDoc({
      type: "doc",
      content: [
        para(
          { type: "text", text: "<script>x</script> " },
          { type: "citation", attrs: { id: id(6), mode: "quote_short", quote: "curto", items: [{ referenceId: id(2), locator: "1" }] } },
          { type: "xref", attrs: { id: id(7), targetType: "section", targetId: id(8) } },
        ),
      ],
    });
    const html = docToHtml(d, { citationHtml: () => "(A, 2024, p. 1)", xrefLabel: () => ({ label: "Capítulo 2", href: "#s" }) });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("“curto” <span class=\"cite\"");
    expect(html).toContain('<a class="xref" href="#s">Capítulo 2</a>');
  });
});

describe("numeração e comparação", () => {
  it("capítulos, subsecções e apêndices numerados; preliminares sem número", () => {
    const s = (i: string, parent: string | null, kind: any, position: number, numbered = true) => ({ id: i, parent_id: parent, kind, title: i, position, numbered });
    const n = computeNumbering([s("capa", null, "preliminary", 1, false), s("c1", null, "chapter", 2), s("c1a", "c1", "section", 1), s("c2", null, "chapter", 3), s("apx", null, "appendix", 4)]);
    expect(Object.fromEntries(n)).toEqual({ c1: "1", c1a: "1.1", c2: "2", apx: "A" });
  });
  it("diff por palavras", () => {
    expect(diffWords("a b c", "a x c").filter((p) => p.type !== "same").map((p) => p.type + ":" + p.text.trim())).toEqual(["del:b", "add:x"]);
  });
});

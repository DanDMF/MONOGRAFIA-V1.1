// Testes APA 7 (secção 47 — Conteúdo e APA). Exemplos fictícios e didáticos.
import { describe, expect, it } from "vitest";
import { renderCitations, narrativeAnd, type CslItem } from "../src/server/modules/bibliography/csl.js";
import { quoteNeedsBlock, countWords, type CitationAttrs } from "../src/shared/doc.js";
import { toCsl } from "../src/server/modules/bibliography/references.js";

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const person = (family: string, given = "A.") => ({ family, given });
const item = (id: string, author: CslItem["author"], year?: number, extra: Partial<CslItem> = {}): CslItem => ({
  id,
  type: "article-journal",
  title: `Obra ${id}`,
  author,
  ...(year ? { issued: { "date-parts": [[year]] } } : {}),
  "container-title": "Revista Fictícia",
  ...extra,
});
const cite = (mode: CitationAttrs["mode"], refs: string[], extra: Partial<CitationAttrs> = {}): CitationAttrs => ({
  id: uid(),
  mode,
  items: refs.map((r) => ({ referenceId: r })),
  ...extra,
});
function render(items: CslItem[], citations: CitationAttrs[], locale: "pt-PT" | "en-US" = "pt-PT", extra = {}) {
  return renderCitations({ locale, items: new Map(items.map((i) => [i.id, i])), citations, ...extra });
}

describe("citações autor-data", () => {
  const one = item("one", [person("Silva")], 2024);
  const two = item("two", [person("Silva"), person("Costa", "B.")], 2024);
  const three = item("three", [person("Silva"), person("Costa", "B."), person("Lima", "C.")], 2024);

  it("um, dois e três ou mais autores (parentética e narrativa, pt-PT)", () => {
    const cs = [
      cite("parenthetical", ["one"]),
      cite("narrative", ["one"]),
      cite("parenthetical", ["two"]),
      cite("narrative", ["two"]),
      cite("parenthetical", ["three"]),
      cite("narrative", ["three"]),
    ];
    const r = render([one, two, three], cs);
    const t = cs.map((c) => r.citations[c.id]!.text);
    expect(t).toEqual([
      "(Silva, 2024)",
      "Silva (2024)",
      "(Silva & Costa, 2024)",
      "Silva e Costa (2024)",
      "(Silva et al., 2024)",
      "Silva et al. (2024)",
    ]);
    // "et al." não fica em itálico
    expect(r.citations[cs[4]!.id]!.html).not.toMatch(/<i>et al/);
  });

  it("perfil inglês usa 'and' na narrativa e '&' na parentética", () => {
    const cs = [cite("narrative", ["two"]), cite("parenthetical", ["two"])];
    const r = render([two], cs, "en-US");
    expect(r.citations[cs[0]!.id]!.text).toBe("Silva and Costa (2024)");
    expect(r.citations[cs[1]!.id]!.text).toBe("(Silva & Costa, 2024)");
  });

  it("narrativeAnd trata três nomes expandidos", () => {
    expect(narrativeAnd("Silva, Costa, &#38; Lima", "pt-PT")).toBe("Silva, Costa e Lima");
    expect(narrativeAnd("Silva, Costa, &#38; Lima", "en-US")).toBe("Silva, Costa, and Lima");
  });

  it("sem data: s.d. (pt-PT) e n.d. (en-US)", () => {
    const nd = item("nd", [person("Silva")]);
    const c = cite("parenthetical", ["nd"]);
    expect(render([nd], [c]).citations[c.id]!.text).toBe("(Silva, s.d.)");
    expect(render([nd], [c], "en-US").citations[c.id]!.text).toBe("(Silva, n.d.)");
  });

  it("mesmo autor e ano: sufixos a/b pela ordem da lista (título), não pela ordem de citação", () => {
    const zeta = item("zeta", [person("Moura", "M.")], 2023, { title: "Zeta: segunda obra" });
    const alfa = item("alfa", [person("Moura", "M.")], 2023, { title: "Alfa: primeira obra" });
    const c1 = cite("parenthetical", ["zeta"]);
    const c2 = cite("parenthetical", ["zeta", "alfa"]);
    const c3 = cite("narrative", ["alfa", "zeta"]);
    const r = render([zeta, alfa], [c1, c2, c3]);
    expect(r.citations[c1.id]!.text).toBe("(Moura, 2023b)");
    expect(r.citations[c2.id]!.text).toBe("(Moura, 2023a, 2023b)");
    expect(r.citations[c3.id]!.text).toBe("Moura (2023a, 2023b)");
    expect(r.bibliography.map((b) => b.id)).toEqual(["alfa", "zeta"]);
    expect(r.bibliography[0]!.text).toContain("(2023a)");
  });

  it("atualizar metadados atualiza as ocorrências (sufixos desaparecem quando o ano muda)", () => {
    const a = item("a1", [person("Moura", "M.")], 2023, { title: "A" });
    const b = item("b1", [person("Moura", "M.")], 2023, { title: "B" });
    const c = cite("parenthetical", ["a1"]);
    expect(render([a, b], [c, cite("parenthetical", ["b1"])]).citations[c.id]!.text).toBe("(Moura, 2023a)");
    const b2 = { ...b, issued: { "date-parts": [[2021]] } };
    expect(render([a, b2], [c, cite("parenthetical", ["b1"])]).citations[c.id]!.text).toBe("(Moura, 2023)");
  });

  it("autores diferentes com o mesmo apelido são desambiguados com iniciais", () => {
    const x = item("x", [{ family: "Silva", given: "Ana" }], 2024);
    const y = item("y", [{ family: "Silva", given: "José" }], 2022);
    const cx = cite("parenthetical", ["x"]);
    const cy = cite("parenthetical", ["y"]);
    const r = render([x, y], [cx, cy]);
    expect(r.citations[cx.id]!.text).toBe("(A. Silva, 2024)");
    expect(r.citations[cy.id]!.text).toBe("(J. Silva, 2022)");
  });

  it("várias obras no mesmo parêntese seguem a ordem da lista de referências", () => {
    const s = item("s", [person("Silva")], 2024);
    const c = item("c", [person("Costa")], 2022);
    const k = cite("parenthetical", ["s", "c"]);
    expect(render([s, c], [k]).citations[k.id]!.text).toBe("(Costa, 2022; Silva, 2024)");
  });

  it("narrativa com autores diferentes gera aviso para inserir individualmente", () => {
    const s = item("s2", [person("Silva")], 2024);
    const c = item("c2", [person("Costa")], 2022);
    const k = cite("narrative", ["s2", "c2"]);
    expect(render([s, c], [k]).citations[k.id]!.warnings.join(" ")).toMatch(/individualmente/);
  });

  it("autor institucional: 1.ª ocorrência com sigla entre parênteses retos, depois só a sigla", () => {
    const inst = item("inst", [{ literal: "Instituto de Estudos Urbanos" }], 2024, { type: "report" });
    const c1 = cite("parenthetical", ["inst"]);
    const c2 = cite("parenthetical", ["inst"]);
    const c3 = cite("narrative", ["inst"]);
    const abbreviations = new Map([["inst", { literal: "Instituto de Estudos Urbanos", abbr: "IEU" }]]);
    const r = render([inst], [c1, c2, c3], "pt-PT", { abbreviations });
    expect(r.citations[c1.id]!.text).toBe("(Instituto de Estudos Urbanos [IEU], 2024)");
    expect(r.citations[c2.id]!.text).toBe("(IEU, 2024)");
    expect(r.citations[c3.id]!.text).toBe("IEU (2024)");
    expect(r.bibliography[0]!.text).toMatch(/^Instituto de Estudos Urbanos\. \(2024\)/);
  });

  it("citação direta com localizador de página e intervalo", () => {
    const c1 = cite("quote_short", ["one"], { quote: "Trecho meramente ilustrativo", items: [{ referenceId: "one", locator: "18", locatorLabel: "page" }] });
    const c2 = cite("parenthetical", ["one"], { items: [{ referenceId: "one", locator: "18-20", locatorLabel: "page" }] });
    const c3 = cite("parenthetical", ["one"], { items: [{ referenceId: "one", locator: "4", locatorLabel: "paragraph" }] });
    const r = render([one], [c1, c2, c3]);
    expect(r.citations[c1.id]!.text).toBe("(Silva, 2024, p. 18)");
    expect(r.citations[c2.id]!.text).toBe("(Silva, 2024, pp. 18–20)");
    expect(r.citations[c3.id]!.text).toBe("(Silva, 2024, par. 4)");
  });

  it("citação direta sem localizador gera aviso", () => {
    const c = cite("quote_short", ["one"], { quote: "texto" });
    expect(render([one], [c]).citations[c.id]!.warnings.join(" ")).toMatch(/localizador/);
  });
});

describe("fontes secundárias e comunicações pessoais", () => {
  const costa = item("costa", [person("Costa")], 2023);
  it("fonte secundária: só a obra consultada entra nas referências", () => {
    const p = cite("secondary", ["costa"], { secondaryAuthor: "Almeida", secondaryYear: "1998" });
    const nr = cite("secondary", ["costa"], { secondaryAuthor: "Almeida", secondaryYear: "1998", narrative: true });
    const noYear = cite("secondary", ["costa"], { secondaryAuthor: "Almeida" });
    const r = render([costa], [p, nr, noYear]);
    expect(r.citations[p.id]!.text).toBe("(Almeida, 1998, como citado em Costa, 2023)");
    expect(r.citations[nr.id]!.text).toBe("Almeida (1998, como citado em Costa, 2023)");
    expect(r.citations[noYear.id]!.text).toBe("(Almeida, como citado em Costa, 2023)");
    expect(r.bibliography.map((b) => b.id)).toEqual(["costa"]);
  });
  it("comunicação pessoal: citada no texto e excluída da lista", () => {
    const pc = { id: "pc1", given_initials: "A. B.", family: "Silva", communication_date: "2025-03-12" };
    const c = { id: uid(), mode: "personal" as const, items: [{ personalId: "pc1" }] };
    const cn = { id: uid(), mode: "personal" as const, items: [{ personalId: "pc1" }], narrative: true };
    const r = renderCitations({ locale: "pt-PT", items: new Map(), personal: new Map([["pc1", pc]]), citations: [c, cn] });
    expect(r.citations[c.id]!.text).toBe("(A. B. Silva, comunicação pessoal, 12 de março de 2025)");
    expect(r.citations[cn.id]!.text).toBe("A. B. Silva (comunicação pessoal, 12 de março de 2025)");
    expect(r.bibliography).toHaveLength(0);
    const en = renderCitations({ locale: "en-US", items: new Map(), personal: new Map([["pc1", pc]]), citations: [c] });
    expect(en.citations[c.id]!.text).toBe("(A. B. Silva, personal communication, March 12, 2025)");
  });
});

describe("lista de referências", () => {
  const authors = (k: number) => Array.from({ length: k }, (_, i) => ({ family: `Autor${i + 1}`, given: "X." }));
  it("20 autores: todos listados com &; 21 autores: 19 + … + último, sem &", () => {
    const a20 = item("a20", authors(20), 2022);
    const a21 = item("a21", authors(21), 2022, { title: "Outra" });
    const r = render([a20, a21], [cite("parenthetical", ["a20"]), cite("parenthetical", ["a21"])]);
    const t20 = r.bibliography.find((b) => b.id === "a20")!.text;
    const t21 = r.bibliography.find((b) => b.id === "a21")!.text;
    expect(t20).toContain("Autor19, X., & Autor20, X. (2022)");
    expect(t21).toContain("Autor19, X., … Autor21, X. (2022)");
    expect(t21).not.toContain("Autor20");
    expect(t21).not.toContain("&");
  });
  it("DOI como ligação https://doi.org/ e ordenação alfabética", () => {
    const z = item("z", [person("Zeferino")], 2020, { DOI: "10.1234/abc" });
    const a = item("a", [person("Abreu")], 2021);
    const r = render([z, a], [cite("parenthetical", ["z"]), cite("parenthetical", ["a"])]);
    expect(r.bibliography.map((b) => b.id)).toEqual(["a", "z"]);
    expect(r.bibliography[1]!.text).toContain("https://doi.org/10.1234/abc");
  });
  it("apenas obras citadas no escopo entram na bibliografia", () => {
    const a = item("a", [person("Abreu")], 2021);
    const b = item("b", [person("Braga")], 2021);
    const r = render([a, b], [cite("parenthetical", ["a"])]);
    expect(r.bibliography.map((x) => x.id)).toEqual(["a"]);
  });
  it("toCsl preserva nomes compostos, partículas e ordem dos autores", () => {
    const csl = toCsl(
      { id: "r", type: "thesis", title: "Tese", issued_year: 2025, institution: "Universidade X", genre: "Dissertação de mestrado", doi: "https://doi.org/10.5555/XYZ" },
      [
        { id: "1", reference_id: "r", role: "author", position: 2, family: "Costa", given: "Bruno", particle: null, suffix: null, literal: null, abbreviation: null },
        { id: "2", reference_id: "r", role: "author", position: 1, family: "Martins Ferreira", given: "Fábio Daniel", particle: "de", suffix: null, literal: null, abbreviation: null },
      ],
    );
    expect(csl.author).toEqual([
      { family: "Martins Ferreira", given: "Fábio Daniel", "non-dropping-particle": "de" },
      { family: "Costa", given: "Bruno" },
    ]);
    expect(csl.DOI).toBe("10.5555/xyz");
    expect(csl.publisher).toBe("Universidade X");
    expect(csl.type).toBe("thesis");
  });
  it("data de consulta só é passada ao estilo quando exigida", () => {
    const base = { id: "w", type: "webpage", title: "Página", url: "https://exemplo.org", accessed_date: "2025-03-12" };
    expect(toCsl({ ...base, issued_year: 2024 }, []).accessed).toBeUndefined();
    expect(toCsl({ ...base, no_date: true }, []).accessed).toBeDefined();
    expect(toCsl({ ...base, issued_year: 2024, show_accessed: true }, []).accessed).toBeDefined();
  });
});

describe("limite de 40 palavras", () => {
  const words = (k: number) => Array.from({ length: k }, (_, i) => `palavra${i}`).join(" ");
  it("39 palavras → curta; 40 → bloco", () => {
    expect(countWords(words(39))).toBe(39);
    expect(quoteNeedsBlock(words(39))).toBe(false);
    expect(quoteNeedsBlock(words(40))).toBe(true);
  });
  it("pontuação isolada não conta como palavra", () => {
    expect(countWords("Olá — mundo , texto.")).toBe(3);
  });
});

describe("exportação bibliográfica (ida e volta pelos importadores)", async () => {
  const { toBibtex, toRis, toCslJson } = await import("../src/server/modules/bibliography/exporters.js");
  const { parseBibtex, parseRis, parseCslJson } = await import("../src/server/modules/bibliography/importers.js");
  const items: CslItem[] = [
    item("r1", [{ family: "Martins Ferreira", given: "Fábio Daniel", "non-dropping-particle": "de" }, { family: "Costa", given: "Bruno" }], 2024, {
      title: "Custos & produtividade: estudo {fictício}",
      volume: "3",
      issue: "2",
      page: "10–20",
      DOI: "10.1234/abc",
    }),
    item("r2", [{ literal: "Instituto de Estudos Urbanos" }], 2023, { type: "report", title: "Relatório", publisher: "IEU" }),
  ];
  it("BibTeX preserva autores (institucional entre chavetas), título e DOI", () => {
    const back = parseBibtex(toBibtex(items));
    expect(back).toHaveLength(2);
    expect(back[0]!.data.contributors).toEqual([
      { role: "author", family: "de Martins Ferreira", given: "Fábio Daniel" },
      { role: "author", family: "Costa", given: "Bruno" },
    ]);
    expect(back[0]!.data.title).toBe("Custos & produtividade: estudo fictício");
    expect(back[0]!.data.pages).toBe("10–20");
    expect(back[0]!.data.doi).toBe("10.1234/abc");
    expect(back[1]!.data.contributors![0]).toMatchObject({ literal: "Instituto de Estudos Urbanos" });
    expect(back[1]!.data.type).toBe("report");
  });
  it("RIS e CSL-JSON fazem ida e volta", () => {
    const ris = parseRis(toRis(items));
    expect(ris.map((c) => c.data.title)).toEqual([items[0]!.title, "Relatório"]);
    expect(ris[0]!.data.pages).toBe("10–20");
    const csl = parseCslJson(toCslJson(items));
    expect(csl[0]!.data.contributors![0]).toMatchObject({ family: "Martins Ferreira", particle: "de" });
    expect(csl[0]!.data.issued_year).toBe(2024);
  });
});

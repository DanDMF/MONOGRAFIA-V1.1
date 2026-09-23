// Guia APA contextual (secção 20). Regras resumidas com versão, origem e data de revisão.
// Os exemplos usam obras FICTÍCIAS definidas aqui em memória e são renderizados pelo mesmo motor CSL usado no
// projeto: o guia nunca diverge do que o sistema produz e os exemplos nunca entram na biblioteca real.
import crypto from "node:crypto";
import type { CitationAttrs, CitationMode } from "../../../shared/doc.js";
import { renderCitations, type CitationLocale, type CslItem } from "./csl.js";

export const GUIDE_REVIEWED_AT = "2026-09-24";
export const APA_VERSION = "APA 7.ª edição (2020), via estilo CSL APA fixado em vendor/csl";
export const APA_STYLE_HOME = "https://apastyle.apa.org/style-grammar-guidelines";

export type RuleOrigin = "APA 7" | "Adaptação pt-PT (VRBAN)" | "Decisão técnica (VRBAN)";

interface ExampleSpec {
  label: string;
  mode: CitationMode;
  refs: string[]; // chaves de FICTITIOUS
  locator?: { label: string; value: string };
  quote?: string;
  secondaryAuthor?: string;
  secondaryYear?: string;
  narrative?: boolean;
  personal?: boolean;
  /** Citações anteriores no mesmo documento (para mostrar 1.ª ocorrência vs. seguintes). */
  occurrence?: number;
}

export interface GuideRule {
  id: string;
  title: string;
  category: "Citações" | "Citações diretas" | "Casos especiais" | "Lista de referências" | "Documento";
  origin: RuleOrigin;
  summary: string[];
  apaTopic: string; // caminho de navegação no APA Style (ligação específica por confirmar pelo autor)
  auditChecks: string[]; // verificações da auditoria que aplicam esta regra
  examples: ExampleSpec[];
  referenceExamples?: string[]; // chaves de FICTITIOUS mostradas como entrada da lista
}

const Y = (y: number) => ({ "date-parts": [[y]] });
/** Obras fictícias e didáticas. Nunca gravadas na base de dados. */
const FICTITIOUS: Record<string, CslItem> = {
  one: { id: "one", type: "article-journal", title: "Hortas verticais em contexto urbano", author: [{ family: "Silva", given: "Ana" }], issued: Y(2024), "container-title": "Revista Fictícia de Estudos Urbanos", volume: "3", issue: "2", page: "10-20", DOI: "10.0000/exemplo.1" },
  two: { id: "two", type: "book", title: "Custos da produção hortícola", author: [{ family: "Silva", given: "Ana" }, { family: "Costa", given: "Bruno" }], issued: Y(2024), publisher: "Editora Exemplo" },
  three: { id: "three", type: "report", title: "Relatório de exemplo sobre recursos hídricos", author: [{ family: "Lima", given: "Carla" }, { family: "Moura", given: "Diogo" }, { family: "Neto", given: "Eva" }], issued: Y(2023), publisher: "Instituto Exemplo" },
  sameA: { id: "sameA", type: "article-journal", title: "Alfa: primeiro estudo fictício", author: [{ family: "Rocha", given: "Filipe" }], issued: Y(2022), "container-title": "Revista Fictícia" },
  sameB: { id: "sameB", type: "article-journal", title: "Beta: segundo estudo fictício", author: [{ family: "Rocha", given: "Filipe" }], issued: Y(2022), "container-title": "Revista Fictícia" },
  older: { id: "older", type: "book", title: "Fundamentos fictícios de agronomia", author: [{ family: "Costa", given: "Bruno" }], issued: Y(2019), publisher: "Editora Exemplo" },
  nodate: { id: "nodate", type: "webpage", title: "Página fictícia sem data", author: [{ family: "Silva", given: "Ana" }], URL: "https://exemplo.org/pagina", accessed: { "date-parts": [[2025, 3, 12]] } },
  group: { id: "group", type: "report", title: "Estudo institucional fictício", author: [{ literal: "Instituto de Estudos Urbanos" }], issued: Y(2024) },
  noauthor: { id: "noauthor", type: "report", title: "Guia fictício de boas práticas", issued: Y(2021), publisher: "Editora Exemplo" },
  many: { id: "many", type: "article-journal", title: "Estudo fictício com vinte e um autores", author: Array.from({ length: 21 }, (_, i) => ({ family: `Autor${i + 1}`, given: "X." })), issued: Y(2022), "container-title": "Revista Fictícia" },
  thesis: { id: "thesis", type: "thesis", title: "Dissertação fictícia sobre cultivo em contentores", author: [{ family: "Neto", given: "Eva" }], issued: Y(2020), genre: "Dissertação de mestrado", publisher: "Universidade Exemplo", archive: "Repositório Exemplo", URL: "https://exemplo.org/repositorio/1" },
};
const ABBREVIATIONS = new Map([["group", { literal: "Instituto de Estudos Urbanos", abbr: "IEU" }]]);
const PERSONAL = new Map([["pc", { id: "pc", given_initials: "A. B.", family: "Silva", communication_date: "2025-03-12" }]]);

export const RULES: GuideRule[] = [
  {
    id: "autor-data",
    title: "Sistema autor-data: um, dois, três ou mais autores",
    category: "Citações",
    origin: "APA 7",
    summary: [
      "Citação parentética: apelido e ano entre parênteses; dois autores ligados por “&”.",
      "Citação narrativa: o apelido faz parte da frase; em português, dois autores ligados por “e” (em inglês, “and”).",
      "Três ou mais autores: primeiro apelido + “et al.” desde a primeira ocorrência, salvo quando é preciso desambiguar. “et al.” não fica em itálico.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Basic Principles of Citation › Author–Date Citation System",
    auditChecks: ["citation_unresolved"],
    examples: [
      { label: "Um autor, parentética", mode: "parenthetical", refs: ["one"] },
      { label: "Um autor, narrativa", mode: "narrative", refs: ["one"] },
      { label: "Dois autores, parentética", mode: "parenthetical", refs: ["two"] },
      { label: "Dois autores, narrativa", mode: "narrative", refs: ["two"] },
      { label: "Três ou mais autores", mode: "parenthetical", refs: ["three"] },
    ],
  },
  {
    id: "varias-obras",
    title: "Várias obras no mesmo parêntese",
    category: "Citações",
    origin: "APA 7",
    summary: [
      "As obras seguem a ordem em que aparecem na lista de referências, separadas por ponto e vírgula.",
      "Na forma narrativa, cite cada obra individualmente, exceto quando têm os mesmos autores.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Basic Principles of Citation › Author–Date Citation System",
    auditChecks: ["citation_ambiguity"],
    examples: [{ label: "Duas obras de autores diferentes", mode: "parenthetical", refs: ["one", "older"] }],
  },
  {
    id: "mesmo-autor-ano",
    title: "Mesmo autor e mesmo ano (a, b, c)",
    category: "Citações",
    origin: "APA 7",
    summary: [
      "As letras são atribuídas pela ordenação da lista de referências (título), não pela ordem em que as obras são citadas.",
      "O VRBAN recalcula as letras em todas as ocorrências quando os metadados mudam.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Basic Principles of Citation › Works With the Same Author and Same Date",
    auditChecks: [],
    examples: [
      { label: "Obra “Beta” citada primeiro", mode: "parenthetical", refs: ["sameB"] },
      { label: "Ambas no mesmo parêntese", mode: "parenthetical", refs: ["sameA", "sameB"] },
    ],
    referenceExamples: ["sameA", "sameB"],
  },
  {
    id: "autor-institucional",
    title: "Autor institucional e siglas",
    category: "Citações",
    origin: "APA 7",
    summary: [
      "Na primeira ocorrência pode apresentar-se o nome completo seguido da sigla; nas seguintes, a sigla, se for útil e inequívoca.",
      "A lista de referências mantém sempre o nome completo.",
      "No VRBAN, a sigla é indicada no autor institucional da fonte (campo “Sigla”).",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Basic Principles of Citation › Group Authors",
    auditChecks: ["acronym_undefined"],
    examples: [
      { label: "Primeira ocorrência", mode: "parenthetical", refs: ["group"] },
      { label: "Ocorrência seguinte", mode: "parenthetical", refs: ["group"], occurrence: 2 },
    ],
    referenceExamples: ["group"],
  },
  {
    id: "sem-data-sem-autor",
    title: "Obras sem data ou sem autor",
    category: "Casos especiais",
    origin: "Adaptação pt-PT (VRBAN)",
    summary: [
      "Sem data: “s.d.” no perfil português (adaptação configurável de “n.d.”, usada no perfil inglês).",
      "Sem autor: o título ocupa a posição do autor. Não escrever “Anónimo”, salvo se a obra estiver assinada assim.",
      "Não inventar datas: o ano do copyright no rodapé de um site não é automaticamente a data da página.",
    ],
    apaTopic: "Style and Grammar Guidelines › References › Missing Reference Information",
    auditChecks: ["reference_missing_author", "reference_missing_date", "webpage_nodate_accessed"],
    examples: [
      { label: "Sem data (perfil pt-PT)", mode: "parenthetical", refs: ["nodate"] },
      { label: "Sem autor", mode: "parenthetical", refs: ["noauthor"] },
    ],
    referenceExamples: ["nodate", "noauthor"],
  },
  {
    id: "citacao-curta",
    title: "Citação direta com menos de 40 palavras",
    category: "Citações diretas",
    origin: "APA 7",
    summary: [
      "Entre aspas duplas, com autor, ano e localizador (p. para uma página, pp. para um intervalo).",
      "A página é a página impressa da fonte, não a posição no ficheiro PDF. Não inventar números de página.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Quotations",
    auditChecks: ["quote_missing_locator", "quote_short_too_long"],
    examples: [{ label: "Com página", mode: "quote_short", refs: ["one"], quote: "trecho meramente ilustrativo", locator: { label: "page", value: "18" } }],
  },
  {
    id: "citacao-bloco",
    title: "Citação direta com 40 palavras ou mais",
    category: "Citações diretas",
    origin: "APA 7",
    summary: [
      "Em bloco recuado (1,27 cm), sem aspas externas, com espaçamento duplo.",
      "O parêntese com a citação vem depois da pontuação final do excerto.",
      "O limite conta apenas as palavras do excerto: 39 → curta; 40 → bloco.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Quotations",
    auditChecks: ["quote_missing_locator", "quote_block_too_short"],
    examples: [{ label: "Parêntese após o bloco", mode: "quote_block", refs: ["two"], locator: { label: "page", value: "3-4" } }],
  },
  {
    id: "sem-paginas",
    title: "Citações diretas de obras sem páginas",
    category: "Citações diretas",
    origin: "APA 7",
    summary: ["Use o número do parágrafo, o título da secção ou, em audiovisual, o tempo (timestamp)."],
    apaTopic: "Style and Grammar Guidelines › Citations › Quotations › Quotations From Sources Without Page Numbers",
    auditChecks: ["quote_missing_locator"],
    examples: [{ label: "Com parágrafo", mode: "quote_short", refs: ["nodate"], quote: "excerto ilustrativo", locator: { label: "paragraph", value: "4" } }],
  },
  {
    id: "parafrase",
    title: "Paráfrase",
    category: "Citações",
    origin: "APA 7",
    summary: [
      "Indicar autor e ano. A página ou o parágrafo são opcionais, mas úteis em textos longos.",
      "Substituir palavras isoladas não garante uma paráfrase adequada; o VRBAN não certifica ausência de plágio.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Paraphrasing",
    auditChecks: [],
    examples: [{ label: "Com página opcional", mode: "parenthetical", refs: ["one"], locator: { label: "page", value: "12" } }],
  },
  {
    id: "fonte-secundaria",
    title: "Fonte secundária",
    category: "Casos especiais",
    origin: "APA 7",
    summary: [
      "Indique a obra original mencionada e a obra efetivamente consultada (“como citado em”).",
      "Só a obra consultada entra na lista de referências. Se a data original for desconhecida, omita-a.",
      "Sempre que possível, consulte a obra original.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Secondary Sources",
    auditChecks: ["secondary_missing_author"],
    examples: [
      { label: "Parentética", mode: "secondary", refs: ["older"], secondaryAuthor: "Almeida", secondaryYear: "1998" },
      { label: "Narrativa", mode: "secondary", refs: ["older"], secondaryAuthor: "Almeida", secondaryYear: "1998", narrative: true },
    ],
  },
  {
    id: "comunicacao-pessoal",
    title: "Comunicação pessoal",
    category: "Casos especiais",
    origin: "APA 7",
    summary: [
      "Comunicações não recuperáveis (conversas, mensagens privadas) são citadas só no texto, com iniciais, apelido e data exata.",
      "Não entram na lista de referências. Os contactos ficam privados.",
      "Entrevistas recolhidas como dados do próprio estudo não são comunicações pessoais: tratam-se como dados de participantes.",
    ],
    apaTopic: "Style and Grammar Guidelines › Citations › Personal Communications",
    auditChecks: ["citation_unresolved"],
    examples: [{ label: "Parentética", mode: "personal", refs: [], personal: true }],
  },
  {
    id: "lista-referencias",
    title: "Lista de referências",
    category: "Lista de referências",
    origin: "APA 7",
    summary: [
      "Inclui só as obras citadas no escopo exportado (a biblioteca pode conter outras leituras).",
      "Ordem alfabética, recuo francês de 1,27 cm, espaçamento duplo.",
      "Até 20 autores: todos. Com 21 ou mais: os primeiros 19, reticências e o último, sem “&”.",
      "DOI no formato https://doi.org/…; o local da editora não é exigido na APA 7.",
    ],
    apaTopic: "Style and Grammar Guidelines › References › Basic Principles of Reference List Entries",
    auditChecks: ["reference_uncited", "reference_duplicate", "doi_malformed"],
    examples: [],
    referenceExamples: ["one", "two", "many", "thesis"],
  },
  {
    id: "titulos",
    title: "Níveis de título",
    category: "Documento",
    origin: "APA 7",
    summary: [
      "Nível 1: centrado, negrito. Nível 2: à esquerda, negrito. Nível 3: à esquerda, negrito itálico.",
      "Níveis 4 e 5: recuados, em linha com o texto (negrito; negrito itálico), terminam em ponto.",
      "Não saltar níveis (por exemplo, de nível 2 diretamente para nível 4).",
      "A numeração de capítulos é uma opção institucional, não uma exigência APA.",
    ],
    apaTopic: "Style and Grammar Guidelines › Paper Format › Headings",
    auditChecks: ["heading_skipped"],
    examples: [],
  },
  {
    id: "siglas",
    title: "Siglas e abreviaturas",
    category: "Documento",
    origin: "APA 7",
    summary: ["Defina cada sigla na primeira utilização no texto (nome por extenso seguido da sigla entre parênteses) e use depois a sigla de forma consistente."],
    apaTopic: "Style and Grammar Guidelines › Paper Format › Abbreviations",
    auditChecks: ["acronym_undefined"],
    examples: [],
  },
  {
    id: "estrutura-institucional",
    title: "Estrutura, capa e elementos preliminares",
    category: "Documento",
    origin: "Decisão técnica (VRBAN)",
    summary: [
      "A APA não impõe uma estrutura universal de capítulos: o modelo “Monografia empírica” é uma sugestão editável.",
      "Capa, folha de aprovação, dedicatória, margens e numeração dependem do regulamento da instituição.",
    ],
    apaTopic: "Style and Grammar Guidelines › Paper Format",
    auditChecks: ["institutional_required_empty"],
    examples: [],
  },
];

const id = () => crypto.randomUUID();

/** Renderiza os exemplos de todas as regras com o motor real, no perfil de citação pedido. */
export function renderGuide(locale: CitationLocale) {
  return RULES.map((rule) => {
    // Cada regra é renderizada isoladamente, para que a desambiguação de uma regra não afete outra.
    const citations: (CitationAttrs & { __label: string; __show: boolean })[] = [];
    for (const ex of rule.examples) {
      for (let k = 1; k <= (ex.occurrence ?? 1); k++) {
        citations.push({
          id: id(),
          mode: ex.mode,
          items: ex.personal
            ? [{ personalId: "pc" }]
            : ex.refs.map((r) => ({ referenceId: r, locator: ex.locator?.value ?? null, locatorLabel: ex.locator?.label ?? null })),
          quote: ex.quote ?? null,
          secondaryAuthor: ex.secondaryAuthor ?? null,
          secondaryYear: ex.secondaryYear ?? null,
          narrative: ex.narrative ?? false,
          __label: ex.label,
          __show: k === (ex.occurrence ?? 1),
        });
      }
    }
    // Referências mostradas: citar em escopo próprio (não visível) para obter as entradas da lista.
    const refCites: CitationAttrs[] = (rule.referenceExamples ?? []).map((r) => ({ id: id(), mode: "parenthetical", items: [{ referenceId: r }] }));
    const out = renderCitations({
      locale,
      items: new Map(Object.entries(FICTITIOUS)),
      abbreviations: ABBREVIATIONS,
      personal: PERSONAL,
      citations: [...citations, ...refCites],
    });
    const refIds = new Set(rule.referenceExamples ?? []);
    return {
      id: rule.id,
      title: rule.title,
      category: rule.category,
      origin: rule.origin,
      version: APA_VERSION,
      reviewedAt: GUIDE_REVIEWED_AT,
      summary: rule.summary,
      apaTopic: rule.apaTopic,
      auditChecks: rule.auditChecks,
      examples: citations
        .filter((c) => c.__show)
        .map((c) => {
          const r = out.citations[c.id]!;
          const prefix = c.mode === "quote_short" && c.quote ? `“${c.quote}” ` : c.mode === "quote_block" ? "[excerto de 40 palavras ou mais, em bloco] " : "";
          return { label: c.__label, text: prefix + r.text, html: prefix.replace(/&/g, "&#38;").replace(/</g, "&#60;") + r.html };
        }),
      references: out.bibliography.filter((b) => refIds.has(b.id)).map((b) => ({ html: b.html, text: b.text })),
    };
  });
}

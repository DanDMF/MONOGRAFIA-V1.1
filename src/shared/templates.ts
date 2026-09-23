// Modelos de estrutura académica (secção 9 da especificação). São sugestões editáveis:
// a APA não impõe uma estrutura universal de capítulos; elementos preliminares dependem da instituição.
// "guidance" orienta o autor e nunca é inserido como texto da monografia.

export type SectionKind = "preliminary" | "chapter" | "section" | "appendix" | "final";

export interface TemplateNode {
  key: string;
  kind: SectionKind;
  title: string;
  numbered?: boolean;
  guidance?: string;
  optional?: boolean; // elemento ativável conforme a instituição
  children?: TemplateNode[];
}

const sub = (key: string, title: string, guidance?: string): TemplateNode => ({ key, kind: "section", title, guidance });

export const TEMPLATE_EMPIRICAL_MONOGRAPH: TemplateNode[] = [
  { key: "cover", kind: "preliminary", title: "Capa", numbered: false, guidance: "Elemento definido pelo perfil institucional." },
  { key: "title_page", kind: "preliminary", title: "Folha de rosto", numbered: false },
  { key: "authorship", kind: "preliminary", title: "Declaração de autoria/originalidade", numbered: false, optional: true },
  { key: "approval", kind: "preliminary", title: "Folha de aprovação", numbered: false, optional: true, guidance: "Apenas se exigida pela instituição." },
  { key: "dedication", kind: "preliminary", title: "Dedicatória", numbered: false, optional: true },
  { key: "acknowledgements", kind: "preliminary", title: "Agradecimentos", numbered: false, optional: true },
  { key: "epigraph", kind: "preliminary", title: "Epígrafe", numbered: false, optional: true, guidance: "Opcional; indicar a fonte." },
  { key: "abstract_pt", kind: "preliminary", title: "Resumo", numbered: false, guidance: "Resumo e palavras-chave." },
  { key: "abstract_en", kind: "preliminary", title: "Abstract", numbered: false, guidance: "Abstract e keywords." },
  {
    key: "intro",
    kind: "chapter",
    title: "Introdução",
    children: [
      sub("intro_context", "Contextualização"),
      sub("intro_problem", "Problema de investigação"),
      sub("intro_questions", "Pergunta central e subperguntas"),
      sub("intro_objectives", "Objetivos", "Objetivo geral e objetivos específicos."),
      sub("intro_justification", "Justificação académica e prática"),
      sub("intro_delimitation", "Delimitação temática, espacial e temporal"),
      sub("intro_organization", "Organização do trabalho"),
    ],
    guidance: "Hipóteses apenas se justificadas pelo desenho do estudo.",
  },
  {
    key: "literature",
    kind: "chapter",
    title: "Revisão da literatura e enquadramento conceptual",
    guidance:
      "Tópicos sugeridos (editáveis, não pré-redigidos): conceitos de agricultura urbana e vertical; sistemas de cultivo; produção e recursos; custos e viabilidade; evidências internacionais e contexto angolano; resultados divergentes; lacunas; quadro conceptual.",
    children: [
      sub("lit_concepts", "Agricultura urbana e agricultura vertical: conceitos"),
      sub("lit_systems", "Sistemas de cultivo"),
      sub("lit_resources", "Produção e recursos"),
      sub("lit_costs", "Custos e viabilidade"),
      sub("lit_context", "Evidências internacionais e contexto angolano"),
      sub("lit_gaps", "Resultados divergentes e lacunas"),
      sub("lit_framework", "Quadro conceptual"),
    ],
  },
  {
    key: "methodology",
    kind: "chapter",
    title: "Metodologia",
    children: [
      sub("met_approach", "Abordagem e desenho"),
      sub("met_unit", "Unidade de análise, local e período"),
      sub("met_crops", "Seleção das culturas"),
      sub("met_sample", "Amostra, repetições e critérios de inclusão/exclusão"),
      sub("met_variables", "Variáveis e instrumentos"),
      sub("met_protocol", "Protocolo e recolha de dados"),
      sub("met_quality", "Qualidade e tratamento dos dados"),
      sub("met_analysis", "Análise e critérios económicos"),
      sub("met_ethics", "Ética e permissões", "Quando aplicável."),
      sub("met_limits", "Limitações metodológicas"),
    ],
  },
  {
    key: "implementation",
    kind: "chapter",
    title: "Caracterização do projeto e implementação",
    children: [
      sub("impl_site", "Local e estrutura"),
      sub("impl_equipment", "Equipamento, materiais e investimento"),
      sub("impl_install", "Procedimento de instalação e cronologia"),
      sub("impl_changes", "Alterações ao protocolo"),
    ],
  },
  {
    key: "results",
    kind: "chapter",
    title: "Resultados",
    guidance: "Separar observação de interpretação.",
    children: [
      sub("res_cycles", "Descrição dos ciclos"),
      sub("res_production", "Produção e perdas"),
      sub("res_resources", "Consumos e trabalho"),
      sub("res_costs", "Custos, receitas e indicadores"),
      sub("res_quality", "Qualidade e cobertura dos dados"),
    ],
  },
  {
    key: "economics",
    kind: "chapter",
    title: "Análise económica e cenários",
    children: [
      sub("eco_assumptions", "Pressupostos"),
      sub("eco_costs", "Investimento, custos, preços e margem"),
      sub("eco_breakeven", "Equilíbrio e fluxos financeiros"),
      sub("eco_sensitivity", "Sensibilidade, energia, escala e replicabilidade"),
    ],
  },
  {
    key: "discussion",
    kind: "chapter",
    title: "Discussão",
    guidance: "Não atribuir causalidade sem suporte do desenho.",
    children: [
      sub("disc_answers", "Resposta às perguntas de investigação"),
      sub("disc_literature", "Comparação com a literatura"),
      sub("disc_implications", "Implicações, validade e limitações"),
      sub("disc_transfer", "Transferibilidade para outros contextos", "Ex.: Benguela e Lobito, com dados."),
    ],
  },
  {
    key: "conclusions",
    kind: "chapter",
    title: "Conclusões e recomendações",
    guidance: "Evitar introduzir resultados novos.",
    children: [
      sub("conc_synthesis", "Síntese e resposta ao objetivo geral"),
      sub("conc_contrib", "Contributos"),
      sub("conc_recommend", "Recomendações e investigação futura"),
    ],
  },
  { key: "references", kind: "final", title: "Referências", numbered: false, guidance: "Gerada automaticamente a partir das citações." },
  { key: "appendices", kind: "appendix", title: "Apêndices", numbered: false, optional: true },
];

export const TEMPLATES: Record<string, { label: string; nodes: TemplateNode[] }> = {
  empirical_monograph: { label: "Monografia empírica", nodes: TEMPLATE_EMPIRICAL_MONOGRAPH },
  custom: { label: "Estrutura personalizada", nodes: [] },
};

export const SECTION_STATUS: Record<string, string> = {
  not_started: "Por iniciar",
  drafting: "Em elaboração",
  needs_source: "Precisa de fonte",
  in_review: "Em revisão",
  ready: "Pronto",
  published: "Publicado",
};

export interface OutlineSection {
  id: string;
  parent_id: string | null;
  kind: SectionKind;
  title: string;
  position: number;
  numbered: boolean;
}

/** Numeração automática: capítulos 1, 2…; subsecções 1.1…; apêndices A, B… A referência cruzada usa IDs. */
export function computeNumbering(sections: OutlineSection[]): Map<string, string> {
  const children = new Map<string | null, OutlineSection[]>();
  for (const s of sections) children.set(s.parent_id, [...(children.get(s.parent_id) ?? []), s]);
  for (const list of children.values()) list.sort((a, b) => a.position - b.position);
  const out = new Map<string, string>();
  let chapter = 0;
  let appendix = 0;
  const walk = (parent: string | null, prefix: string) => {
    let n = 0;
    for (const s of children.get(parent) ?? []) {
      let num = "";
      if (parent === null) {
        if (s.kind === "chapter" && s.numbered) num = String(++chapter);
        else if (s.kind === "appendix" && s.numbered) num = String.fromCharCode(65 + appendix++);
      } else if (prefix && s.numbered) {
        num = `${prefix}.${++n}`;
      }
      if (num) out.set(s.id, num);
      walk(s.id, num);
    }
  };
  walk(null, "");
  return out;
}

/** Ordem de leitura (pré-ordem da árvore). */
export function readingOrder<T extends OutlineSection>(sections: T[]): T[] {
  const children = new Map<string | null, T[]>();
  for (const s of sections) children.set(s.parent_id, [...(children.get(s.parent_id) ?? []), s]);
  for (const list of children.values()) list.sort((a, b) => a.position - b.position);
  const out: T[] = [];
  const walk = (p: string | null) => {
    for (const s of children.get(p) ?? []) {
      out.push(s);
      walk(s.id);
    }
  };
  walk(null);
  return out;
}

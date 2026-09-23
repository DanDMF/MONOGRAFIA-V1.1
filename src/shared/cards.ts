// Próximo parágrafo (secção 12): etapas do cartão e verificações de avanço, partilhadas por servidor e cliente.
// As verificações orientam; não bloqueiam o autor, exceto a integração (precisa de rascunho e secção).

export const CARD_STAGES = ["idea", "research", "reading", "notes", "drafting", "review", "integrated"] as const;
export type CardStage = (typeof CARD_STAGES)[number];

export const CARD_STAGE_LABEL: Record<CardStage, string> = {
  idea: "Ideia",
  research: "Pesquisa",
  reading: "Leitura",
  notes: "Notas",
  drafting: "Redação",
  review: "Revisão",
  integrated: "Integrado",
};

export const CARD_STAGE_HINT: Record<CardStage, string> = {
  idea: "Formule a ideia numa frase e a pergunta a que o parágrafo responde.",
  research: "Escolha a secção de destino e identifique as fontes a ler.",
  reading: "Leia as fontes e registe a localização (página, parágrafo…) do que interessa.",
  notes: "Separe excerto literal, paráfrase e comentário próprio; escreva a sua interpretação.",
  drafting: "Escreva o parágrafo com as suas palavras, apoiado nas notas.",
  review: "Releia: a afirmação está sustentada? A citação e a localização estão certas?",
  integrated: "O parágrafo está na secção; continue a revê-lo no editor.",
};

export interface CardShape {
  idea: string | null;
  question: string | null;
  section_id: string | null;
  interpretation: string | null;
  draft: string | null;
  sources: { locator: string | null }[];
  excerpts: { kind: string }[];
}

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;

/** O que ainda falta para o cartão estar completo até à etapa indicada (inclusive). */
export function cardGaps(c: CardShape, upTo: CardStage): string[] {
  const idx = CARD_STAGES.indexOf(upTo);
  const gaps: string[] = [];
  const need = (stage: CardStage, cond: boolean, msg: string) => {
    if (CARD_STAGES.indexOf(stage) <= idx && !cond) gaps.push(msg);
  };
  need("idea", filled(c.idea), "Ideia por escrever.");
  need("research", filled(c.question), "Pergunta por definir.");
  need("research", !!c.section_id, "Secção de destino por escolher.");
  need("reading", c.sources.length > 0, "Nenhuma fonte ligada.");
  need("notes", c.excerpts.length > 0 || filled(c.interpretation), "Sem excertos nem interpretação própria.");
  need("notes", c.sources.every((s) => filled(s.locator)), "Há fontes sem localização (página, parágrafo…).");
  need("drafting", filled(c.draft), "Rascunho do parágrafo vazio.");
  return gaps;
}

/** Palavras do rascunho (mesma regra da contagem das secções). */
export function draftWords(t: string | null | undefined): number {
  return (t ?? "").split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

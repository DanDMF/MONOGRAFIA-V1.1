// Gera docs/DATA_DICTIONARY.md a partir de src/shared/entities.ts (fonte única) + tabelas não genéricas.
import fs from "node:fs";
import { ENTITIES, ORIGINS } from "../src/shared/entities.js";

const lines: string[] = [
  "# Dicionário de dados",
  "",
  "> Gerado por `npm run docs:dictionary` a partir de `src/shared/entities.ts` (a mesma definição valida o servidor, gera os formulários e a folha `Dicionario` do Excel). Não editar à mão a secção gerada.",
  "",
  "Convenções: IDs UUID estáveis; valores ausentes = `NULL` (nunca zero); montantes e medições em `numeric` (sem perda de precisão); datas civis `date` (sem fuso); instantes `timestamptz` (UTC); todos os registos têm `project_id`, `version` (concorrência otimista) e, quando aplicável, `archived_at` (arquivo em vez de eliminação). Histórico de valores em `audit_event.before/after`.",
  "",
  `Origens do dado (\`data_origin\`): ${Object.entries(ORIGINS).map(([k, v]) => `\`${k}\` = ${v}`).join("; ")}.`,
  "",
  "## Entidades de dados (geradas)",
  "",
];
for (const def of Object.values(ENTITIES)) {
  lines.push(`### ${def.labelPlural} — \`${def.table}\`${def.sheet ? ` · folha Excel \`${def.sheet}\`` : ""}${def.immutable ? " · imutável" : ""}`, "");
  lines.push("| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |", "|---|---|---|---|---|---|---|");
  for (const [k, f] of Object.entries(def.fields)) {
    const vals = f.values ? Object.entries(f.values).map(([a, b]) => `\`${a}\`=${b}`).join(", ") : "";
    const ref = f.kind === "ref" ? `→ \`${f.ref === "reference" ? "reference" : ENTITIES[f.ref!].table}\`` : "";
    lines.push(`| \`${k}\` | ${f.label} | ${f.kind} ${ref} | ${f.unit ?? ""} | ${f.required ? "sim" : ""} | ${f.private ? "sim" : ""} | ${[f.description, vals].filter(Boolean).join(" ")} |`);
  }
  lines.push("");
}
lines.push(
  "## Tabelas de conteúdo, bibliografia e sistema (esquema em `migrations/`)",
  "",
  "| Tabela | Função | Relações principais |",
  "|---|---|---|",
  "| `app_user` | Contas (email único, hash argon2id) | — |",
  "| `user_session` | Sessões (só hash SHA-256 do token) | `user_id` |",
  "| `project` | Projeto, perfil de citação, fuso, moeda, `is_demo`, publicação apresentada | `current_publication_id` |",
  "| `project_member` | Lista explícita de acesso (`author`/`reviewer`) | projeto, utilizador |",
  "| `audit_event` | Histórico: ação, entidade, antes/depois | projeto, utilizador |",
  "| `stored_file` | Metadados de ficheiros (SHA-256, visibilidade, validade) | projeto |",
  "| `job` | Fila persistente (estado, tentativas, idempotência, resultado) | projeto |",
  "| `section` | Árvore da monografia (tipo, posição, numeração, estado, orientação) | `parent_id`, `current_revision_id` |",
  "| `section_revision` | Documento JSON por revisão (autosave/marco, restauro) | secção |",
  "| `reference` | Metadados bibliográficos completos, estados de leitura/verificação, origem | `merged_into` |",
  "| `reference_contributor` | Autores/editores ordenados (apelido, nome, partícula, sufixo, institucional, sigla) | referência |",
  "| `personal_communication` | Comunicações pessoais (contacto privado) | projeto |",
  "| `excerpt` | Excertos literais/paráfrases/comentários com localizador e página PDF | referência |",
  "| `reading_note` | Ficha de leitura (uma por fonte) | referência |",
  "| `citation` / `citation_item` | Índice derivado das citações do documento | secção, referência, comunicação pessoal, excerto |",
  "| `review_comment` | Comentários de revisão (interface pendente) | secção |",
  "| `publication` / `publication_item` | Snapshots imutáveis e manifesto | projeto |",
  "",
  "## Entidades da especificação ainda não modeladas",
  "",
  "InstitutionalProfile, ContentBlock (os blocos vivem no JSON da revisão), ParagraphCard, Note, Concept, Objective, ResearchQuestion, LiteratureSearch, DatasetVersion, Analysis, Figure, Table, Scenario, ScenarioParameter, Attachment (parcial: `stored_file`), ImportBatch, Task, KnowledgeItem, Claim, EvidenceLink, Decision, ExtractionCandidate, Dependency (as dependências atuais são calculadas: `analysis/dependencies.ts`).",
  "",
);
fs.writeFileSync("docs/DATA_DICTIONARY.md", lines.join("\n"));
console.log("docs/DATA_DICTIONARY.md gerado.");

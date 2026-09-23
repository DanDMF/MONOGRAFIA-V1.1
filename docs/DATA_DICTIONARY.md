# Dicionário de dados

> Gerado por `npm run docs:dictionary` a partir de `src/shared/entities.ts` (a mesma definição valida o servidor, gera os formulários e a folha `Dicionario` do Excel). Não editar à mão a secção gerada.

Convenções: IDs UUID estáveis; valores ausentes = `NULL` (nunca zero); montantes e medições em `numeric` (sem perda de precisão); datas civis `date` (sem fuso); instantes `timestamptz` (UTC); todos os registos têm `project_id`, `version` (concorrência otimista) e, quando aplicável, `archived_at` (arquivo em vez de eliminação). Histórico de valores em `audit_event.before/after`.

Origens do dado (`data_origin`): `measured` = Medição direta; `document` = Documento; `estimate` = Estimativa; `literature` = Literatura; `assumption` = Pressuposto.

## Entidades de dados (geradas)

### Versões do protocolo — `protocol_version` · imutável

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `number` | Número da versão | int  |  | sim |  |  |
| `title` | Título | text  |  | sim |  |  |
| `effective_from` | Em vigor desde | date  |  |  |  |  |
| `responsible` | Responsáveis | text  |  |  |  |  |
| `instruments` | Instrumentos e calibração | longtext  |  |  |  |  |
| `frequency` | Frequência de recolha | text  |  |  |  |  |
| `procedures` | Procedimentos | longtext  |  |  |  |  |
| `exclusion_criteria` | Critérios de exclusão | longtext  |  |  |  |  |
| `deviations` | Desvios conhecidos | longtext  |  |  |  |  |
| `supersedes_id` | Substitui a versão | ref → `protocol_version` |  |  |  |  |

### Dicionário de variáveis — `variable`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `code` | Código | text  |  | sim |  |  |
| `name` | Nome | text  |  | sim |  |  |
| `operational_definition` | Definição operacional | longtext  |  |  |  |  |
| `role` | Papel | text  |  |  |  |  |
| `data_type` | Tipo | text  |  |  |  |  |
| `unit` | Unidade | text  |  |  |  |  |
| `method` | Método | text  |  |  |  |  |
| `instrument` | Instrumento | text  |  |  |  |  |
| `periodicity` | Periodicidade | text  |  |  |  |  |
| `plausible_min` | Mínimo plausível | decimal  |  |  |  |  |
| `plausible_max` | Máximo plausível | decimal  |  |  |  |  |
| `missing_rule` | Regra para ausência | text  |  |  |  |  |
| `transformation` | Transformação | text  |  |  |  |  |
| `source` | Fonte | text  |  |  |  |  |
| `experimental_unit` | Unidade experimental | text  |  |  |  |  |
| `observation_unit` | Unidade de observação | text  |  |  |  |  |
| `notes` | Observações | longtext  |  |  |  |  |

### Locais — `location` · folha Excel `Locais`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `name` | Nome | text  |  | sim |  |  |
| `city` | Cidade | text  |  |  |  |  |
| `public_label` | Designação pública genérica | text  |  |  |  | Ex.: Luanda. Nunca a morada. |
| `description` | Características | longtext  |  |  |  |  |
| `coords_private` | Coordenadas/morada (privado) | text  |  |  | sim |  |
| `is_public` | Pode ser apresentado publicamente | bool  |  |  |  |  |

### Estruturas — `structure` · folha Excel `Estruturas`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `code` | Código | text  |  | sim |  |  |
| `location_id` | Local | ref → `location` |  | sim |  |  |
| `system` | Sistema de cultivo | text  |  |  |  |  |
| `levels` | Níveis | int  |  |  |  |  |
| `containers` | Recipientes | int  |  |  |  |  |
| `capacity_plants` | Capacidade (plantas) | int  |  |  |  |  |
| `equipment` | Equipamentos | longtext  |  |  |  |  |
| `footprint_area_m2` | Área de implantação | decimal  | m² |  |  | Área ocupada no solo. Não multiplicar pelos níveis. |
| `cultivation_area_m2` | Área total de cultivo | decimal  | m² |  |  | Soma das superfícies de cultivo de todos os níveis (já agregada). |
| `useful_area_m2` | Área útil ocupada | decimal  | m² |  |  |  |
| `circulation_area_m2` | Área de circulação | decimal  | m² |  |  |  |
| `area_notes` | Fronteiras dos denominadores de área | longtext  |  |  |  |  |
| `in_use_from` | Em uso desde | date  |  |  |  |  |
| `in_use_to` | Em uso até | date  |  |  |  |  |

### Culturas — `crop` · folha Excel `Culturas`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `name` | Cultura | text  |  | sim |  |  |
| `variety` | Variedade | text  |  |  |  |  |
| `scientific_name` | Nome científico | text  |  |  |  |  |
| `seed_supplier` | Fornecedor/marca da semente | text  |  |  |  |  |
| `notes` | Notas | longtext  |  |  |  |  |

### Ciclos — `cycle` · folha Excel `Ciclos`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `code` | Código do ciclo | text  |  | sim |  |  |
| `crop_id` | Cultura | ref → `crop` |  | sim |  |  |
| `structure_id` | Estrutura | ref → `structure` |  | sim |  |  |
| `protocol_version_id` | Versão do protocolo | ref → `protocol_version` |  |  |  |  |
| `lot` | Lote | text  |  |  |  |  |
| `sowing_date` | Sementeira | date  |  |  |  |  |
| `transplant_date` | Transplante | date  |  |  |  |  |
| `start_date` | Início | date  |  |  |  |  |
| `end_date` | Fim | date  |  |  |  |  |
| `initial_plants` | Plantas iniciais | int  |  |  |  |  |
| `substrate` | Substrato | text  |  |  |  |  |
| `irrigation` | Irrigação | text  |  |  |  |  |
| `status` | Estado | enum  |  | sim |  | `planned`=Planeado, `active`=Em curso, `finished`=Concluído, `failed`=Perdido/falhado, `cancelled`=Cancelado |
| `area_fraction` | Fração da área da estrutura usada | decimal  | 0–1 | sim |  | Para ciclos simultâneos na mesma estrutura; evita somar áreas partilhadas como independentes. |
| `notes` | Notas | longtext  |  |  |  |  |

### Registos de campo — `field_event` · folha Excel `Registos_Campo`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `cycle_id` | Ciclo | ref → `cycle` |  | sim |  |  |
| `occurred_on` | Data do acontecimento | date  |  | sim |  |  |
| `event_type` | Tipo | enum  |  | sim |  | `irrigation`=Irrigação, `fertilization`=Fertilização, `growth`=Crescimento, `pest`=Praga, `disease`=Doença, `loss`=Perda, `maintenance`=Manutenção, `intervention`=Intervenção, `photo`=Fotografia, `note`=Nota |
| `value` | Valor | decimal  |  |  |  |  |
| `unit` | Unidade | text  |  |  |  |  |
| `origin` | Origem do dado | enum  |  | sim |  | Medição, documento, estimativa, literatura ou pressuposto — estados distintos. `measured`=Medição direta, `document`=Documento, `estimate`=Estimativa, `literature`=Literatura, `assumption`=Pressuposto |
| `method` | Método | text  |  |  |  |  |
| `description` | Descrição | longtext  |  |  |  |  |

### Colheitas — `harvest` · folha Excel `Colheitas`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `cycle_id` | Ciclo | ref → `cycle` |  | sim |  |  |
| `harvest_date` | Data da colheita | date  |  | sim |  |  |
| `gross_kg` | Peso bruto | decimal  | kg |  |  |  |
| `marketable_kg` | Peso comercializável | decimal  | kg |  |  |  |
| `rejected_kg` | Peso rejeitado | decimal  | kg |  |  |  |
| `units_count` | N.º de unidades/embalagens | int  |  |  |  |  |
| `unit_label` | Unidade comercial (ex.: maço) | text  |  |  |  |  |
| `destination` | Destino | enum  |  |  |  | `stock`=Stock, `sale`=Venda, `own_consumption`=Consumo próprio, `sample`=Amostra, `loss`=Perda, `mixed`=Misto |
| `origin` | Origem do dado | enum  |  | sim |  | Medição, documento, estimativa, literatura ou pressuposto — estados distintos. `measured`=Medição direta, `document`=Documento, `estimate`=Estimativa, `literature`=Literatura, `assumption`=Pressuposto |
| `method` | Método de pesagem | text  |  |  |  |  |
| `instrument` | Instrumento | text  |  |  |  |  |
| `notes` | Notas | longtext  |  |  |  |  |

### Consumos — `consumption` · folha Excel `Consumos`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `resource` | Recurso | enum  |  | sim |  | `water`=Água, `energy`=Energia, `other`=Outro |
| `structure_id` | Estrutura | ref → `structure` |  |  |  |  |
| `cycle_id` | Ciclo | ref → `cycle` |  |  |  |  |
| `period_start` | Início do período | date  |  |  |  |  |
| `period_end` | Fim do período | date  |  |  |  |  |
| `reading_start` | Leitura inicial do contador | decimal  |  |  |  |  |
| `reading_end` | Leitura final do contador | decimal  |  |  |  |  |
| `quantity` | Quantidade consumida | decimal  |  |  |  |  |
| `unit` | Unidade | enum  |  | sim |  | `L`=L, `m3`=m³, `Wh`=Wh, `kWh`=kWh, `h`=h, `other`=Outra |
| `power_w` | Potência (para estimar energia) | decimal  | W |  |  |  |
| `hours_used` | Tempo de utilização | decimal  | h |  |  |  |
| `instrument` | Instrumento | text  |  |  |  |  |
| `origin` | Origem do dado | enum  |  | sim |  | Medição, documento, estimativa, literatura ou pressuposto — estados distintos. `measured`=Medição direta, `document`=Documento, `estimate`=Estimativa, `literature`=Literatura, `assumption`=Pressuposto |
| `notes` | Notas | longtext  |  |  |  |  |

### Trabalho — `labor_entry` · folha Excel `Trabalho`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `cycle_id` | Ciclo | ref → `cycle` |  |  |  |  |
| `work_date` | Data | date  |  | sim |  |  |
| `hours` | Horas | decimal  | h | sim |  |  |
| `task` | Tarefa | text  |  |  |  |  |
| `worker_label` | Quem (designação) | text  |  |  |  |  |
| `is_paid` | Trabalho pago | bool  |  |  |  | Separado da valorização do trabalho do autor. |
| `hourly_rate` | Valor por hora | decimal  |  |  |  |  |
| `currency` | Moeda | text  |  |  |  | Código ISO 4217 (ex.: AOA, EUR). Totais nunca misturam moedas. |
| `origin` | Origem do dado | enum  |  | sim |  | Medição, documento, estimativa, literatura ou pressuposto — estados distintos. `measured`=Medição direta, `document`=Documento, `estimate`=Estimativa, `literature`=Literatura, `assumption`=Pressuposto |
| `notes` | Notas | longtext  |  |  |  |  |

### Ativos — `asset` · folha Excel `Ativos`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `name` | Designação | text  |  | sim |  |  |
| `category` | Categoria | text  |  |  |  |  |
| `acquired_on` | Aquisição | date  |  |  |  |  |
| `in_use_from` | Entrada em uso | date  |  |  |  |  |
| `cost` | Custo de aquisição | decimal  |  | sim |  |  |
| `installation_cost` | Custo de instalação | decimal  |  |  |  |  |
| `currency` | Moeda | text  |  | sim |  | Código ISO 4217 (ex.: AOA, EUR). Totais nunca misturam moedas. |
| `useful_life_months` | Vida útil | int  | meses |  |  |  |
| `residual_value` | Valor residual | decimal  |  |  |  |  |
| `depreciation_method` | Depreciação | enum  |  | sim |  | `linear`=Linear, `none`=Sem depreciação |
| `structure_id` | Estrutura | ref → `structure` |  |  |  |  |
| `notes` | Notas | longtext  |  |  |  |  |

### Despesas — `expense` · folha Excel `Despesas`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `expense_date` | Data | date  |  | sim |  |  |
| `category` | Categoria | enum  |  | sim |  | `seeds`=Sementes, `substrate`=Substratos, `fertilizer`=Fertilizantes, `water`=Água, `energy`=Energia, `labor`=Trabalho, `transport`=Transporte, `packaging`=Embalagem, `maintenance`=Manutenção, `other`=Outros |
| `description` | Descrição | text  |  | sim |  |  |
| `supplier_private` | Fornecedor (privado) | text  |  |  | sim |  |
| `quantity` | Quantidade | decimal  |  |  |  |  |
| `unit` | Unidade | text  |  |  |  |  |
| `unit_price` | Preço unitário | decimal  |  |  |  |  |
| `tax_amount` | Imposto | decimal  |  |  |  |  |
| `amount` | Valor total | decimal  |  | sim |  |  |
| `currency` | Moeda | text  |  | sim |  | Código ISO 4217 (ex.: AOA, EUR). Totais nunca misturam moedas. |
| `cost_behavior` | Comportamento | enum  |  | sim |  | `fixed`=Fixo, `variable`=Variável |
| `is_operational` | Custo operacional | bool  |  |  |  |  |
| `origin` | Origem do dado | enum  |  | sim |  | Medição, documento, estimativa, literatura ou pressuposto — estados distintos. `measured`=Medição direta, `document`=Documento, `estimate`=Estimativa, `literature`=Literatura, `assumption`=Pressuposto |
| `replaces_expense_id` | Substitui a estimativa | ref → `expense` |  |  |  | Quando uma fatura real substitui um custo estimado: a estimativa deixa de contar. |
| `notes` | Notas | longtext  |  |  |  |  |

### Repartições — `allocation` · folha Excel `Reparticoes`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `expense_id` | Despesa | ref → `expense` |  | sim |  |  |
| `cycle_id` | Ciclo | ref → `cycle` |  | sim |  |  |
| `method` | Critério | enum  |  | sim |  | `direct`=Direto (100% do ciclo), `area`=Área, `time`=Tempo, `measured`=Consumo medido, `production`=Produção, `percentage`=Percentagem justificada |
| `share` | Fração atribuída | decimal  | 0–1 | sim |  | Soma das frações de uma despesa não pode exceder 1; a parte não atribuída é mostrada. |
| `justification` | Justificação do critério | longtext  |  |  |  |  |

### Vendas — `sale` · folha Excel `Vendas`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `cycle_id` | Ciclo | ref → `cycle` |  |  |  |  |
| `crop_id` | Cultura | ref → `crop` |  |  |  |  |
| `sale_date` | Data | date  |  | sim |  |  |
| `quantity` | Quantidade | decimal  |  | sim |  |  |
| `commercial_unit` | Unidade comercial | text  |  | sim |  |  |
| `kg_equivalent` | Peso equivalente | decimal  | kg |  |  | Só com fator medido ou pressuposto identificado. |
| `kg_equivalent_origin` | Origem do peso equivalente | enum  |  |  |  | `measured`=Medição direta, `document`=Documento, `estimate`=Estimativa, `literature`=Literatura, `assumption`=Pressuposto |
| `unit_price` | Preço unitário | decimal  |  |  |  |  |
| `discount` | Desconto | decimal  |  |  |  |  |
| `amount` | Valor recebido | decimal  |  | sim |  |  |
| `currency` | Moeda | text  |  | sim |  | Código ISO 4217 (ex.: AOA, EUR). Totais nunca misturam moedas. |
| `channel` | Canal | text  |  |  |  |  |
| `notes` | Notas | longtext  |  |  |  |  |

### Taxas de câmbio — `exchange_rate` · folha Excel `Taxas_Cambio`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `from_currency` | De | text  |  | sim |  |  |
| `to_currency` | Para | text  |  | sim |  |  |
| `rate` | Taxa | decimal  |  | sim |  |  |
| `rate_date` | Data | date  |  | sim |  |  |
| `source` | Fonte | text  |  | sim |  |  |

### Excertos — `excerpt`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `reference_id` | Fonte | ref → `reference` |  | sim |  |  |
| `kind` | Tipo | enum  |  | sim |  | `literal`=Excerto literal, `paraphrase`=Paráfrase, `comment`=Comentário do autor |
| `text` | Texto | longtext  |  | sim |  |  |
| `locator_label` | Tipo de localizador | enum  |  |  |  | `page`=Página, `paragraph`=Parágrafo, `section`=Secção, `timestamp`=Tempo, `figure`=Figura, `table`=Tabela, `chapter`=Capítulo |
| `locator` | Localizador (página impressa, parágrafo…) | text  |  |  |  |  |
| `pdf_page_index` | Página no ficheiro PDF | int  |  |  |  | Distinta da página impressa. |
| `is_translation` | Tradução própria | bool  |  |  |  |  |
| `note` | Nota | longtext  |  |  |  |  |

### Comunicações pessoais — `personal_communication`

| Campo | Rótulo | Tipo | Unidade | Obrig. | Privado | Definição / valores |
|---|---|---|---|---|---|---|
| `given_initials` | Iniciais do nome próprio (ex.: A. B.) | text  |  | sim |  |  |
| `family` | Apelido | text  |  | sim |  |  |
| `communication_date` | Data | date  |  | sim |  |  |
| `medium` | Meio | text  |  |  |  |  |
| `authorization_note` | Autorização | longtext  |  |  |  |  |
| `private_contact` | Contacto (privado) | text  |  |  | sim |  |

## Tabelas de conteúdo, bibliografia e sistema (esquema em `migrations/`)

| Tabela | Função | Relações principais |
|---|---|---|
| `app_user` | Contas (email único, hash argon2id) | — |
| `user_session` | Sessões (só hash SHA-256 do token) | `user_id` |
| `project` | Projeto, perfil de citação, fuso, moeda, `is_demo`, publicação apresentada | `current_publication_id` |
| `project_member` | Lista explícita de acesso (`author`/`reviewer`) | projeto, utilizador |
| `audit_event` | Histórico: ação, entidade, antes/depois | projeto, utilizador |
| `stored_file` | Metadados de ficheiros (SHA-256, visibilidade, validade) | projeto |
| `job` | Fila persistente (estado, tentativas, idempotência, resultado) | projeto |
| `section` | Árvore da monografia (tipo, posição, numeração, estado, orientação) | `parent_id`, `current_revision_id` |
| `section_revision` | Documento JSON por revisão (autosave/marco, restauro) | secção |
| `reference` | Metadados bibliográficos completos, estados de leitura/verificação, origem | `merged_into` |
| `reference_contributor` | Autores/editores ordenados (apelido, nome, partícula, sufixo, institucional, sigla) | referência |
| `personal_communication` | Comunicações pessoais (contacto privado) | projeto |
| `excerpt` | Excertos literais/paráfrases/comentários com localizador e página PDF | referência |
| `reading_note` | Ficha de leitura (uma por fonte) | referência |
| `citation` / `citation_item` | Índice derivado das citações do documento | secção, referência, comunicação pessoal, excerto |
| `review_comment` | Comentários de revisão (interface pendente) | secção |
| `publication` / `publication_item` | Snapshots imutáveis e manifesto | projeto |

## Entidades da especificação ainda não modeladas

InstitutionalProfile, ContentBlock (os blocos vivem no JSON da revisão), ParagraphCard, Note, Concept, Objective, ResearchQuestion, LiteratureSearch, DatasetVersion, Analysis, Figure, Table, Scenario, ScenarioParameter, Attachment (parcial: `stored_file`), ImportBatch, Task, KnowledgeItem, Claim, EvidenceLink, Decision, ExtractionCandidate, Dependency (as dependências atuais são calculadas: `analysis/dependencies.ts`).

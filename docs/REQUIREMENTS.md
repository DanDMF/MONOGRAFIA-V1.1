# Matriz de requisitos — VRBAN

Fonte: `docs/VRBAN_SPEC.md` (protocolo A–H e secções 1–65). Um requisito por comportamento verificável.

**Estados** (texto, não só cor): **Verificado** (teste automático ou verificação em browser executada) · **Implementado** (código funcional sem teste dedicado) · **Parcial** (parte do comportamento existe; o restante é descrito) · **Pendente** (especificado, ainda não implementado) · **Opcional** (avançado/ativável; não ativado à força) · **Necessita dados** (implementado; depende de dados reais do autor) · **Bloqueado** (dependência externa).

**Fases** (secções 48/64): F0 Fundação · F1 Monografia · F2 Bibliografia · F3 Investigação · F4 Economia · F5 Dados e Excel · F6 Análise e portfólio · F7 Entrega · TX Núcleo transversal (51–65).

**Evidência**: `T-APA` = tests/apa.test.ts · `T-CALC` = tests/calc.test.ts · `T-ACAD` = tests/academic-flow.test.ts · `T-ANA` = tests/analytic-flow.test.ts · `E2E` = scripts/e2e-browser.mjs (Chromium real) · `XLSX` = scripts/verify_xlsx.py (openpyxl + recálculo LibreOffice) · `T-AUD` = tests/academic-audit.test.ts · `T-DOC` = tests/document-export.test.ts (DOCX/PDF; páginas do PDF renderizadas e inspecionadas visualmente).

Última atualização: 2026-09-23.

## Protocolo de execução (A–H)

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-A-001 | Implementar (não só aconselhar); decisões reversíveis sem pedir confirmação | F0 | Verificado | Código em `src/`, decisões em DECISIONS.md |
| VRB-A-002 | Aplicação corre sem sessão Claude Code; IA interna separada e opcional | F0 | Implementado | Sem dependência de IA; `npm start` |
| VRB-A-003 | Conteúdo importado é material de investigação, não instrução | TX | Implementado | Importadores só produzem candidatos (`importers.ts`) |
| VRB-B-001 | Inspeção inicial (SO, Git, runtimes, Postgres, Docker, browser) registada | F0 | Verificado | PROGRESS.md §Ambiente |
| VRB-B-002 | Não expor segredos em terminal/documentação | F0 | Implementado | `.env` ignorado; logs com cookies redigidos (`app.ts`) |
| VRB-C-001 | TypeScript + React + servidor modular + PostgreSQL | F0 | Verificado | ARCHITECTURE.md |
| VRB-C-002 | Cálculos e autorizações centralizados no servidor; sem duplicar regras no cliente/Excel | F0 | Verificado | `analysis/calc.ts`; Excel usa resultados do servidor + fórmulas de reprodução (`XLSX`) |
| VRB-C-003 | Autenticação com bibliotecas consolidadas, sem palavra-passe predefinida; provisionamento explícito | F0 | Verificado | argon2 (`@node-rs/argon2`), `provision-author.ts`, `T-ACAD` |
| VRB-C-004 | Primeira conta registada não se torna dona; sem auto-registo | F0 | Implementado | Não existe rota de registo; `project_member` explícito |
| VRB-C-005 | Armazenamento por interface (local persistente; alternativa para alojamento) | F0 | Verificado | `LocalStorage` e `DbStorage` (ficheiros na base, para discos efémeros) (`tests/deploy.test.ts`, contentor reiniciado sem perda); S3-compatível opcional pendente |
| VRB-C-006 | Fila persistente com bloqueio, retentativas, idempotência e recuperação | F0 | Verificado | `jobs/queue.ts` (SKIP LOCKED, backoff, órfãs >15 min), `T-ANA` |
| VRB-C-007 | Documentar aplicação, worker, base e ficheiros; Docker opcional | F0 | Verificado | README, `docs/DEPLOY.md`, `Dockerfile` e `render.yaml` verificados em contentor (D-017) |
| VRB-D-001 | CLAUDE.md conciso + docs/* de continuidade | F0 | Verificado | Ficheiros presentes |
| VRB-D-002 | Requisitos granulares com IDs, fase, estado e evidência | F0 | Verificado | Este ficheiro |
| VRB-E-001 | Percurso académico completo demonstrado | F1 | Verificado | `T-ACAD`, `E2E` |
| VRB-E-002 | Percurso analítico completo até XLSX utilizável | F5 | Verificado | `T-ANA`, `E2E`, `XLSX` |
| VRB-F-001 | Transações para operações compostas; concorrência otimista; decimais para dinheiro | F0 | Verificado | `tx()`, colunas `version`, `numeric`; `T-ACAD` (409), `T-ANA` (409) |
| VRB-F-002 | Migrações que preservam dados; migrador recusa alteração de migração aplicada | F0 | Implementado | `db/migrate.ts` (checksum) |
| VRB-F-003 | Dados de demonstração opt-in, isolados, identificados | F0 | Parcial | Coluna `project.is_demo` + faixa na interface; gerador de dados demo pendente |
| VRB-G-001 | Scripts de tipos, testes, build, migrações e arranque verificados | F0 | Verificado | `package.json`; lint ESLint pendente (D-012) |
| VRB-G-002 | Testes de cálculo, APA, autorização, snapshots, importação, exportação, idempotência | F0 | Verificado | 94 testes (ver PROGRESS.md) |
| VRB-G-003 | Verificação em browser dos dois percursos, erros de gravação e telemóvel | F7 | Verificado | `E2E` (percursos, telemóvel 390 px, teclado); erro de gravação coberto só na API |
| VRB-G-004 | XLSX relido com ferramenta independente | F5 | Verificado | `XLSX` |
| VRB-G-005 | DOCX/PDF renderizados antes de declarar prontos | F7 | Verificado | `T-DOC`; páginas do PDF renderizadas com `pdftoppm` e inspecionadas (título, índice, corpo, referências) |

## 1–3. Missão, contexto e camadas de configuração

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-001-001 | Centro integrado: módulos como vistas da mesma base canónica | TX | Implementado | Entidades relacionadas por IDs; indicadores/exportações/publicação leem a mesma base |
| VRB-001-002 | Do resultado ao cálculo ao registo original | F4 | Verificado | Indicadores com `inputs` (tabela/ID); diálogo “Ver cálculo”; `T-ANA` |
| VRB-001-003 | Do parágrafo à fonte | F2 | Verificado | Citação → referência → ocorrências; `T-ACAD` |
| VRB-001-004 | Automatizações indicam o que fazem, propõem e o que depende de dados | TX | Parcial | Estados de indicador, avisos de citação; matriz formal de automatizações em ARCHITECTURE.md |
| VRB-001-005 | Produto inclui site público, área privada, editor, biblioteca, APA, registos, economia, exportações, histórico, publicação | TX | Parcial | Simulador e backups automáticos pendentes |
| VRB-002-001 | Projeto real começa vazio (sem dados inventados), com modelos e orientações | F0 | Verificado | `applyTemplate` só cria estrutura + orientação; `E2E` parte de base vazia |
| VRB-002-002 | Autor, título, instituição editáveis; nome e título independentes | F0 | Implementado | Definições (`Settings.tsx`), campos `name`/`academic_title` |
| VRB-002-003 | Culturas extensíveis (salsa, coentros, manjericão, hortelã…) | F3 | Implementado | Entidade `crop` livre |
| VRB-003-001 | Camada APA separada da institucional e da web | F7 | Parcial | APA (CSL) e web separados; perfil institucional pendente |
| VRB-003-002 | Cada regra com origem (APA/instituição/autor/técnica) e diferenças explícitas | F7 | Pendente | — |
| VRB-003-003 | Carregar regulamento institucional; extração só como sugestão | F7 | Pendente | — |
| VRB-003-004 | Estrutura de capítulos apresentada como modelo editável, não exigência APA | F1 | Verificado | Texto na página Estrutura; `templates.ts` |

## 4. Utilizadores, acesso e propriedade

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-004-001 | Autenticar não concede edição; lista explícita de contas autorizadas | F0 | Verificado | `requireProject`; `T-ACAD` (conta não autorizada → 403) |
| VRB-004-002 | Papel revisor: consulta sem publicar/alterar | F0 | Verificado | `T-ACAD` (revisor 200 em leitura, 403 em escrita/publicação) |
| VRB-004-003 | Revisor comenta | F7 | Pendente | Tabela `review_comment` criada; rotas/interface pendentes |
| VRB-004-004 | Servidor verifica permissões em todas as operações e downloads | F0 | Verificado | `T-ACAD`, `T-ANA` (download anónimo → 401) |
| VRB-004-005 | Público contém só objetos publicados | F1 | Verificado | Rotas `/api/public` leem `publication_item`; `T-ACAD` |
| VRB-004-006 | Morada, faturas, contactos, notas privadas não publicados/exportados por omissão | F5 | Verificado | Campos `private`; `T-ANA` (fornecedor ausente no XLSX) |
| VRB-004-007 | Convites só com destinatário e confirmação explícita | F0 | Pendente | Sem envio de mensagens (nenhuma funcionalidade de convite) |

## 5–8. Navegação pública, privada, identidade, página inicial

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-005-001 | Menu principal com subnavegação; abas sem conteúdo ocultas | F6 | Verificado | `Public.tsx` (Resultados/Referências só com conteúdo); `E2E` |
| VRB-005-002 | “Investigação em desenvolvimento” sem publicação | F6 | Implementado | `PublicLayout`, `PublicRoot` |
| VRB-005-003 | Abas Projeto, Metodologia, Experimento, Explorar dados, Cenários, Autor | F6 | Pendente | Início, Monografia, Resultados, Referências, Documentos implementados |
| VRB-006-001 | Navegação lateral em 5 grupos com URLs estáveis | F0 | Verificado | `App.tsx`; `E2E` |
| VRB-006-002 | Itens pendentes identificados como tal na navegação | F0 | Implementado | “· pendente” em `App.tsx` |
| VRB-006-003 | Telemóvel: menu recolhível e ações rápidas (colheita, despesa, registo) | F0 | Verificado | `E2E` (390 px) |
| VRB-006-004 | Ação rápida “nova ideia” | F1 | Implementado | Painel (“Próximo parágrafo”) e barra superior “+ Ideia”; `scripts/e2e-browser.mjs` |
| VRB-006-005 | Preservar filtros na navegação (URL) | F5 | Parcial | Filtros em estado local; persistência na URL pendente |
| VRB-007-001 | Paleta marfim/verde/terra; largura de leitura | F6 | Verificado | `styles.css`; capturas `E2E` |
| VRB-007-002 | Modo claro/escuro, tamanho de letra, modo de leitura, reduzir movimento | F6 | Implementado | `ReadingPrefs.tsx`, `prefs.ts` |
| VRB-007-003 | Teclado, foco visível, rótulos, estados não só por cor | F6 | Verificado | `E2E` (ligação de salto); badges com texto |
| VRB-007-004 | Fotografias com legenda/crédito/alt; remoção de metadados sensíveis na cópia pública | F6 | Pendente | Galeria pendente |
| VRB-007-005 | Tabelas largas deslizam no telemóvel sem reduzir texto | F6 | Verificado | `.table-wrap`; `E2E` sem deslocamento horizontal |
| VRB-008-001 | Início com nome, título, autor, estado, versão e atualização | F6 | Verificado | `PublicHome`; `E2E` |
| VRB-008-002 | Narrativa problema → … → implicações | F6 | Parcial | Faixa de percurso; síntese por secção depende de conteúdo |
| VRB-008-003 | Indicadores de destaque só com dados, abrindo definição | F6 | Parcial | Página Resultados com definição; destaques na página inicial pendentes |
| VRB-008-004 | “Como citar” com dados reais, sem DOI inventado, citando versão concreta | F6 | Verificado | `howToCite`; `T-ACAD` |

## 9–11. Estrutura académica, matriz de coerência, editor

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-009-001 | Modelo “Monografia empírica” com preliminares ativáveis e capítulos 1–8 | F1 | Verificado | `templates.ts`; `T-ACAD` |
| VRB-009-002 | Modelo “Dissertação empírica” | F1 | Pendente | — |
| VRB-009-003 | “Estrutura personalizada” | F1 | Implementado | `custom` + criação livre de capítulos |
| VRB-009-004 | Tópicos como sugestões editáveis (orientação), nunca texto pré-redigido | F1 | Verificado | Campo `guidance` separado do documento |
| VRB-009-005 | Reorganizar preservando IDs e ligações; índice atualizado | F1 | Verificado | `T-ACAD` (reordenar → xref/citações intactas) |
| VRB-009-006 | Índice geral, listas de tabelas/figuras/siglas automáticas | F7 | Pendente | Índice web existe; listas dependem de tabelas/figuras |
| VRB-010-001 | Matriz problema→pergunta→objetivo→…→conclusão | F6 | Pendente | — |
| VRB-010-002 | Avisos de objetivos sem evidência | F6 | Pendente | — |
| VRB-010-003 | Exportar matriz para Excel/Word | F6 | Pendente | — |
| VRB-011-001 | Editor estruturado (JSON semântico) com títulos, listas, citações | F1 | Verificado | TipTap + `sanitizeDoc`; `E2E` |
| VRB-011-002 | Tabelas, fórmulas, notas, imagens, gráficos e anexos no editor | F1 | Pendente | — |
| VRB-011-003 | Sanitização no servidor (lista explícita de nós/marcas; links http/https/mailto) | F1 | Verificado | `T-ACAD` (nó `script` recusado) |
| VRB-011-004 | Autosave com estado visível; “gravado” só após confirmação do servidor | F1 | Verificado | `EditorPage.tsx`; `E2E` (“Gravado no servidor às”) |
| VRB-011-005 | Recuperação após falha (cópia local de emergência) | F1 | Implementado | `vrban.draft.<id>` + faixa de recuperação |
| VRB-011-006 | Histórico de versões, comparação e restauro não destrutivo | F1 | Verificado | `T-ACAD` (restauro cria nova revisão); diff por palavras |
| VRB-011-007 | Conflito entre sessões detetado, sem sobrescrever | F1 | Verificado | `T-ACAD` (409 + conteúdo intacto); diálogo de conflito |
| VRB-011-008 | Estados da secção (por iniciar … publicado) | F1 | Verificado | `SECTION_STATUS`; `T-ACAD` (drafting automático) |
| VRB-011-009 | Marcar trechos e comentários privados | F7 | Pendente | Tabela `review_comment` |
| VRB-011-010 | Referências cruzadas por ID a secções/apêndices, renumeração automática | F1 | Verificado | `T-ACAD` (Capítulo 3 → Capítulo 1) |
| VRB-011-011 | Referências cruzadas a tabelas, figuras, equações | F6 | Pendente | Tipos aceites no esquema; resolução pendente |
| VRB-011-012 | Contagem de palavras por secção excluindo bibliografia | F1 | Verificado | `docWordCount`; `T-ACAD` |
| VRB-011-013 | Progresso por estado declarado com pesos opcionais; palavras ≠ qualidade | F1 | Parcial | Painel mostra estados; coluna `weight` sem cálculo ponderado |

## 12–15. Próximo parágrafo, biblioteca, motor APA, assistente de citação

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-012-001 | Cartão “Próximo parágrafo” e fluxo ideia→integrado | F1 | Verificado | Migração 0007; `tests/paragraph-cards.test.ts` (13); e2e browser (cartão → parágrafo integrado com citação e localização; telemóvel 390 px) |
| VRB-012-002 | Excerto literal, paráfrase e comentário separados | F2 | Implementado | `excerpt.kind`; página Excertos; detalhe da fonte |
| VRB-012-003 | Ficha de leitura completa | F2 | Parcial | Tabela `reading_note`; interface pendente |
| VRB-012-004 | Matriz da literatura com diferenças de base explícitas | F2 | Pendente | — |
| VRB-013-001 | Metadados completos (tipo, autores ordenados, datas com precisão, DOI, URL, ISBN, licença, etiquetas, estados) | F2 | Verificado | `reference` + `reference_contributor`; `T-ACAD` |
| VRB-013-002 | Nomes compostos, acentos, partículas e ordem preservados; separação não inferida silenciosamente | F2 | Verificado | `T-APA` (toCsl); importação assinala separação inferida (`T-ACAD`) |
| VRB-013-003 | 14 tipos de obra | F2 | Implementado | `REFERENCE_TYPES` |
| VRB-013-004 | Pesquisa por autor, título, tema, ano | F2 | Implementado | `listReferences(search)` |
| VRB-013-005 | Deteção de duplicados (DOI, título+ano) | F2 | Verificado | `T-ACAD` |
| VRB-013-006 | Fusão com pré-visualização preservando citações | F2 | Verificado | `T-ACAD` |
| VRB-013-007 | Arquivo sem quebrar referências | F2 | Implementado | Citações resolvem fontes arquivadas (`loadCslItems`) |
| VRB-013-008 | Importar BibTeX, RIS, CSL-JSON com pré-visualização | F2 | Verificado | `T-ACAD` (BibTeX); RIS/CSL-JSON implementados sem teste dedicado |
| VRB-013-009 | Consulta de DOI/metadados externa com confirmação | F2 | Pendente | Requer integração de rede (Crossref) |
| VRB-013-010 | Origem dos metadados registada | F2 | Implementado | `metadata_source` |
| VRB-014-001 | Motor CSL APA 7 fixado e documentado | F2 | Verificado | `vendor/csl` + SHA256; `/api/health` |
| VRB-014-002 | Citações como objetos (IDs, modalidade, localizador, prefixo/sufixo, excerto) | F2 | Verificado | Nó `citation` + índice `citation`/`citation_item` |
| VRB-014-003 | Metadados alterados atualizam todas as ocorrências | F2 | Verificado | `T-ACAD` (2024→2025) |
| VRB-014-004 | Perfil pt-PT (e, s.d.) e perfil inglês (and, n.d.); & na parentética | F2 | Verificado | `T-APA` |
| VRB-014-005 | Grafia original dos títulos mantida; sem tradução silenciosa | F2 | Implementado | Títulos passados sem transformação |
| VRB-015-001 | Assistente: várias fontes, modalidades, localizadores, pré-visualização, inserir ligada | F2 | Verificado | `CitationDialog.tsx`; `E2E` |
| VRB-015-002 | Clicar citação abre dados, permite editar/remover e copiar | F2 | Parcial | Editar/remover/copiar citação; “todas as ocorrências” está no detalhe da fonte |
| VRB-015-003 | Guia com exemplos fictícios que nunca entram na bibliografia | F2 | Verificado | Obras fictícias em memória renderizadas pelo motor CSL; biblioteca inalterada (`T-AUD`) |

## 16–21. Regras APA

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-016-001 | Um autor: Silva (2024) / (Silva, 2024) | F2 | Verificado | `T-APA` |
| VRB-016-002 | Dois autores: Silva e Costa (2024) / (Silva & Costa, 2024) | F2 | Verificado | `T-APA` |
| VRB-016-003 | Três ou mais: et al. desde a 1.ª ocorrência; et al. sem itálico | F2 | Verificado | `T-APA` |
| VRB-016-004 | Mesmo autor/ano: a/b pela ordem da lista, não da citação | F2 | Verificado | `T-APA` |
| VRB-016-005 | Várias obras na mesma parentética pela ordem da lista | F2 | Verificado | `T-APA` |
| VRB-016-006 | Narrativa com obras de autores diferentes → selecionar individualmente | F2 | Verificado | `T-APA` (aviso) |
| VRB-016-007 | Sem data: s.d. (pt) / n.d. (en) | F2 | Verificado | `T-APA` |
| VRB-016-008 | Autor institucional com sigla na 1.ª ocorrência, depois sigla; lista com nome completo | F2 | Verificado | `T-APA`, `T-ACAD` |
| VRB-016-009 | Desambiguação de autores com o mesmo apelido | F2 | Verificado | `T-APA` (A. Silva / J. Silva) |
| VRB-016-010 | Sem autor: título na posição do autor | F2 | Implementado | Substituição nativa do estilo CSL; sem teste dedicado |
| VRB-017-001 | Paráfrase com localizador opcional | F2 | Verificado | `T-APA` (par. 4) |
| VRB-017-002 | Citação curta (<40 palavras) com aspas e localizador | F2 | Verificado | `T-APA` (limite 39/40); `docToHtml` |
| VRB-017-003 | Citação em bloco (≥40) sem aspas, parêntese após pontuação, recuo 1,27 cm | F2 | Verificado | Nó `citationBlock`; CSS 1,27 cm; estilo DOCX `BlockQuote` (`T-DOC`) |
| VRB-017-004 | p./pp.; página impressa ≠ página do PDF | F2 | Verificado | `T-APA`; `excerpt.pdf_page_index` separado |
| VRB-017-005 | Parágrafo, secção, timestamp como localizadores | F2 | Implementado | `LOCATOR_LABELS`; sondagem CSL documentada |
| VRB-017-006 | Aviso de citação direta sem localizador | F2 | Verificado | `T-APA` |
| VRB-017-007 | Omissões, interpolações, ênfase e tradução própria identificadas | F2 | Parcial | `excerpt.is_translation`; sufixo livre; mostrar original ao lado pendente |
| VRB-018-001 | Fonte secundária: só a consultada nas referências; data original não inventada | F2 | Verificado | `T-APA` |
| VRB-018-002 | Comunicação pessoal citada no texto e fora da lista; contactos privados | F2 | Verificado | `T-APA`; `private_contact` privado |
| VRB-018-003 | Participantes do estudo tratados como dados anonimizados | F3 | Pendente | — |
| VRB-018-004 | Verificador citação–referência reconhece exceções | F2 | Verificado | Comunicações pessoais e fontes secundárias tratadas como exceções legítimas; exceções justificadas pelo autor (`T-AUD`) |
| VRB-019-001 | Biblioteca consultada ≠ referências citadas; exportação parcial com bibliografia do escopo | F2 | Verificado | `T-ACAD` (publicação parcial); `T-APA` |
| VRB-019-002 | Ordem alfabética, recuo francês 1,27 cm, espaçamento duplo | F2 | Verificado | CSL; CSS `.bibliography`; estilo DOCX `Reference` (hanging 720) (`T-DOC`, PDF inspecionado) |
| VRB-019-003 | Até 20 autores todos; 21+: 19 + … + último, sem & | F2 | Verificado | `T-APA` |
| VRB-019-004 | Modelos por tipo renderizados pelo motor | F2 | Implementado | Estilo CSL; teses/relatórios mapeados em `toCsl` |
| VRB-019-005 | DOI como https://doi.org/… | F2 | Verificado | `T-APA`, `T-ACAD` |
| VRB-019-006 | Data de consulta interna; mostrada só quando exigida | F2 | Verificado | `T-APA` (toCsl) |
| VRB-019-007 | Revisão de campos em falta com explicação | F2 | Implementado | Detalhe da fonte (“Informação em falta…”) |
| VRB-020-001 | Guia APA contextual com versão, origem e data | F2 | Verificado | 15 regras com origem (APA / adaptação pt-PT / decisão técnica), versão, data de revisão, tópico APA Style e ligação à página oficial (`T-AUD`); URLs específicos não verificáveis deste ambiente (D-016) |
| VRB-020-002 | Auditoria académica (citações desligadas, duplicados, autor/data ausentes, localizador, excerto longo, não citadas, ambiguidades, DOI, títulos saltados, siglas, campos institucionais) | F2 | Verificado | 17 verificações + 1 declarada não aplicável (tabelas/figuras) (`T-AUD`, verificação em browser) |
| VRB-020-003 | Classificação erro estrutural / informação incompleta / revisão humana; exceções justificadas, auditadas e revogáveis | F2 | Verificado | `audit_exception` (migração 0005) (`T-AUD`) |
| VRB-020-004 | Sem garantia automática de conformidade, qualidade ou ausência de plágio | F2 | Verificado | Aviso explícito na página e na API (`T-AUD`) |
| VRB-021-001 | Cinco níveis de título APA na exportação | F7 | Verificado | Heading1 centrado negrito, Heading2 esquerda negrito, Heading3 negrito itálico, níveis 4–5 em linha (`T-DOC`) |
| VRB-021-002 | Tabelas e figuras numeradas com notas e fonte | F6 | Pendente | — |
| VRB-021-003 | Perfil APA de estudante (margens 2,54 cm, duplo, 1,27 cm) | F7 | Verificado | `docx.ts`; A4; paginação superior direita; sem running head (`T-DOC`) |

## 22–29. Pesquisa, protocolo, estruturas, ciclos, colheitas, recursos, custos, moedas

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-022-001 | Registo de pesquisas bibliográficas (bases, expressões, datas, inclusão/exclusão) | F2 | Pendente | — |
| VRB-022-002 | Conceitos com definição, fonte e uso; mapa + tabela | F2 | Pendente | — |
| VRB-022-003 | PDFs privados com pesquisa textual/OCR identificada | TX | Pendente | — |
| VRB-023-001 | Versões de protocolo imutáveis (nova versão em vez de reescrita) | F3 | Implementado | `protocol_version` com `immutable` (PATCH recusado) |
| VRB-023-002 | Dicionário de variáveis completo | F3 | Implementado | Entidade `variable` |
| VRB-023-003 | Unidade experimental vs. observação | F3 | Implementado | Campos em `variable` |
| VRB-024-001 | Local com coordenadas privadas e designação pública | F3 | Verificado | `T-ANA` (privado fora do XLSX) |
| VRB-024-002 | Áreas de implantação, cultivo, útil e circulação separadas | F3 | Verificado | `structure`; `T-CALC` |
| VRB-024-003 | Não multiplicar área agregada pelos níveis; fração de área por ciclo | F3 | Verificado | `T-CALC` |
| VRB-025-001 | Ciclo com cultura, estrutura, datas, lote, estado, protocolo | F3 | Verificado | `T-ANA`, `E2E` |
| VRB-025-002 | Datas coerentes (fim ≥ início); datas impossíveis recusadas | F3 | Verificado | `T-ANA` |
| VRB-025-003 | Diário de campo com data do acontecimento, data de introdução, origem, método | F3 | Implementado | `field_event` |
| VRB-025-004 | Origens distintas (medição, documento, estimativa, literatura, pressuposto) | F3 | Implementado | Domínio `data_origin` |
| VRB-025-005 | Duplicar formulário sem duplicar IDs | F3 | Implementado | Botão “Duplicar” (novo ID) |
| VRB-025-006 | Anexos privados por defeito | F3 | Pendente | Upload de anexos pendente |
| VRB-026-001 | Múltiplas colheitas por ciclo com bruto/comercializável/rejeitado | F3 | Verificado | `T-ANA`, `T-CALC` |
| VRB-026-002 | Balanço validado (comercializável ≤ bruto) | F3 | Verificado | `T-ANA` |
| VRB-026-003 | Vendas com unidade comercial; kg equivalente só com origem identificada | F4 | Implementado | Restrição SQL + validação |
| VRB-026-004 | Colheita não gera receita realizada | F4 | Verificado | `T-CALC` |
| VRB-026-005 | Reconciliação produção vs. destinos | F4 | Pendente | — |
| VRB-027-001 | Consumos por contador, direto ou estimativa potência × horas | F3 | Verificado | `T-CALC` (sem água → estado explicado); estimativa identificada |
| VRB-027-002 | Conversões L/m³ e Wh/kWh | F3 | Implementado | `toLiters`, `toKwh` |
| VRB-027-003 | Trabalho pago vs. valorização do autor | F4 | Parcial | Campo `is_paid`; custo valorizado do trabalho pendente |
| VRB-027-004 | Evitar dupla contagem de fatura e estimativa substituída | F4 | Verificado | `replaces_expense_id`; `T-CALC` |
| VRB-028-001 | Ativos com vida útil, residual, instalação | F4 | Implementado | `asset` |
| VRB-028-002 | Despesas com categoria, fornecedor privado, imposto, comprovativo | F4 | Parcial | Comprovativo (upload) pendente |
| VRB-028-003 | Custo fixo/variável documentado | F4 | Implementado | `cost_behavior` |
| VRB-028-004 | Repartição por critério explícito; soma ≤ 100% (servidor + trigger) | F4 | Verificado | `T-ANA` (409) |
| VRB-028-005 | Parcela não atribuída mostrada | F4 | Verificado | `T-CALC`, `T-ANA` |
| VRB-028-006 | Aquisição e depreciação nunca somadas; visões caixa/económica separadas | F4 | Verificado | `T-CALC` |
| VRB-029-001 | Moeda original sempre explícita; sem conversão silenciosa nem totais mistos | F4 | Verificado | `T-CALC` (mixed_currency) |
| VRB-029-002 | Taxas de câmbio com data e fonte | F4 | Implementado | `exchange_rate`; conversão aplicada pendente |
| VRB-029-003 | Datas civis sem fuso; instantes em UTC; fuso do projeto configurável | F0 | Implementado | Parser `date` como string; `timestamptz`; `project.timezone` |
| VRB-029-004 | Ausência = nulo, nunca zero | F3 | Verificado | `T-ANA` (peso bruto vazio → null), `T-CALC` |

## 30–35. Indicadores, viabilidade, cenários, estatística, explorador, gráficos

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-030-001 | Indicador com código, fórmula, unidade, dados usados, exclusões, versão | F4 | Verificado | `IndicatorResult`; `T-CALC` |
| VRB-030-002 | Produção comercializável, produtividade (implantação e cultivo), perdas de peso | F4 | Verificado | `T-CALC` |
| VRB-030-003 | Custo operacional/kg | F4 | Verificado | `T-CALC` (500 Kz/kg) |
| VRB-030-004 | Receita realizada, saldo, margem sobre receita | F4 | Verificado | `T-CALC` |
| VRB-030-005 | Margem de contribuição e equilíbrio | F4 | Verificado | `T-CALC` |
| VRB-030-006 | Consumos específicos (L, kWh, h por kg) | F4 | Implementado | `computeCycleIndicators` |
| VRB-030-007 | Depreciação linear repartida | F4 | Verificado | `T-CALC` |
| VRB-030-008 | Estados explicados (dados insuficientes, zero, margem não positiva) sem infinitos | F4 | Verificado | `T-CALC` |
| VRB-030-009 | Razão agregada, não média de razões | F4 | Verificado | `T-CALC` (180 vs 300) |
| VRB-030-010 | Não anualizar | F4 | Implementado | Unidades “por ciclo” |
| VRB-030-011 | Receita potencial (projeção) | F6 | Pendente | Depende de cenários |
| VRB-031-001 | Fluxos de caixa, VAL, TIR, payback | F6 | Opcional | Pendente (módulo ativável) |
| VRB-032-001 | Cenários independentes base/favorável/desfavorável | F6 | Pendente | — |
| VRB-032-002 | Sensibilidade 1 e 2 variáveis | F6 | Pendente | — |
| VRB-032-003 | Rede/solar e replicabilidade Benguela/Lobito parametrizadas | F6 | Pendente | — |
| VRB-033-001 | Estatística descritiva com unidade de análise | F6 | Pendente | — |
| VRB-033-002 | Inferência só em módulo avançado | F6 | Opcional | Não ativado |
| VRB-034-001 | Grelha: ordenar, filtrar, pesquisar, seleção múltipla, cabeçalho fixo | F5 | Verificado | `EntityPage.tsx`; `E2E` |
| VRB-034-002 | Escolher colunas, paginação e edição inline | F5 | Parcial | Primeiras 9 colunas; edição em diálogo |
| VRB-034-003 | Correções preservam valor anterior (histórico) | F5 | Verificado | `T-ANA` (before/after) |
| VRB-034-004 | Painel de qualidade dos dados | F5 | Parcial | Validações e avisos no painel; painel dedicado pendente |
| VRB-035-001 | Gráficos com tabela acessível, PNG/SVG, versão académica | F6 | Pendente | — |
| VRB-035-002 | Aviso de análise publicada possivelmente desatualizada | F6 | Implementado | `dependentsOf` (possiblyOutdated) |

## 36–40. Exportações e importações

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-036-001 | XLSX real (não CSV/HTML renomeado) | F5 | Verificado | `XLSX`, `T-ANA` |
| VRB-036-002 | Exportar tabela atual/seleção (CSV) | F5 | Verificado | `T-ANA` |
| VRB-036-003 | Exportar ciclo(s) ou toda a investigação | F5 | Verificado | `T-ANA` (escopo por ciclo) |
| VRB-036-004 | Exportar cenário | F6 | Pendente | — |
| VRB-036-005 | Exportar pacote público de uma versão publicada | F5 | Pendente | — |
| VRB-036-006 | Modelo vazio para recolha offline | F5 | Verificado | `T-ANA` |
| VRB-036-007 | Pré-visualização do escopo (linhas, privacidade, versão) | F5 | Verificado | `T-ANA`, `E2E` |
| VRB-036-008 | Modos valores / fórmulas / ambos, com legenda | F5 | Verificado | `T-ANA`, `XLSX` |
| VRB-037-001 | Folhas LEIA_ME…Referencias com seleção | F5 | Verificado | `T-ANA` |
| VRB-037-002 | Folhas Resumo, Cenarios, Citacoes, Matriz_Objetivos, Qualidade | F5 | Pendente | — |
| VRB-038-001 | Cabeçalhos com unidades, filtros, primeira linha fixa, larguras | F5 | Verificado | `XLSX` (freeze), `T-ANA` |
| VRB-038-002 | Tipos corretos; IDs texto; datas; vazios ≠ zero | F5 | Verificado | `T-ANA`, `XLSX` |
| VRB-038-003 | Fórmulas reais coincidentes com o sistema (tolerância 1e-9) | F5 | Verificado | `XLSX` (recálculo LibreOffice sem cache) |
| VRB-038-004 | Recálculo ao abrir | F5 | Verificado | `fullCalcOnLoad` (`T-ANA`) |
| VRB-038-005 | Texto nunca interpretado como fórmula (XLSX e CSV) | F5 | Verificado | `T-ANA` |
| VRB-038-006 | Sem macros nem ligações externas | F5 | Verificado | `T-ANA`, `XLSX` |
| VRB-038-007 | Geração em segundo plano com estado, cancelamento e download autenticado com validade | F5 | Verificado | `T-ANA` (fila, 401 anónimo); validade 7 dias |
| VRB-038-008 | Gráficos nativos no Excel | F6 | Pendente | — |
| VRB-038-009 | Divisão/ZIP quando limites são atingidos, sem truncar | F5 | Pendente | Limite atual 5 000 linhas no CSV (documentado) |
| VRB-039-001 | Assistente de importação Excel/CSV com mapeamento e pré-visualização | F5 | Pendente | — |
| VRB-039-002 | Lotes de importação anuláveis | F5 | Pendente | — |
| VRB-040-001 | DOCX com estilos reais, sumário, legendas, referências | F7 | Parcial | Estilos reais, sumário (campo TOC com pedido de atualização), citações e referências verificados (`T-DOC`); legendas de tabelas/figuras pendentes (dependem de VRB-021-002) |
| VRB-040-002 | PDF com texto selecionável, índice, paginação verificada | F7 | Verificado | LibreOffice via UNO atualiza o índice; `pdftotext`, `pdffonts` (fontes incorporadas), páginas inspecionadas (`T-DOC`) |
| VRB-040-003 | Exportação bibliográfica BibTeX/RIS/CSL-JSON | F2 | Verificado | `exporters.ts`; ida e volta pelos importadores (`T-APA`) |
| VRB-040-004 | Pacote ZIP reproduzível | F7 | Pendente | — |

## 41–47. Publicação, portfólio, planeamento, segurança, modelo, fluxos, aceitação

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-041-001 | Pré-visualizar como visitante | F1 | Implementado | “Ver como visitante”; pré-visualização privada no editor |
| VRB-041-002 | Snapshot imutável (texto, citações, bibliografia, indicadores) | F1 | Verificado | Trigger de imutabilidade; `T-ACAD` |
| VRB-041-003 | Rascunhos posteriores não alteram snapshot | F1 | Verificado | `T-ACAD`, `E2E` |
| VRB-041-004 | Nova publicação = nova versão; voltar a apresentar versão anterior | F1 | Implementado | `setCurrentPublication`; rotas `/v/:n` |
| VRB-041-005 | Retirar remove acesso a rotas públicas | F1 | Verificado | `T-ACAD` |
| VRB-041-006 | Dependências de figura/tabela/cálculo na publicação | F6 | Parcial | Manifesto regista revisões, estilo e versão do cálculo |
| VRB-042-001 | Perfil de autor/portfólio sem inventar graus | F6 | Pendente | — |
| VRB-042-002 | Galeria com original privado e cópia pública otimizada | F6 | Pendente | — |
| VRB-042-003 | Conteúdo em inglês separado e revisto | F6 | Pendente | — |
| VRB-043-001 | Tarefas, calendário, checklist de entrega | F7 | Pendente | — |
| VRB-043-002 | IA opcional e desativável; aplicação funciona sem IA | TX | Verificado | Nenhuma dependência de IA |
| VRB-044-001 | Permissões no servidor, sessões protegidas (httpOnly, SameSite, Secure em produção), CSRF | F0 | Verificado | `T-ACAD` (CSRF 403) |
| VRB-044-002 | Limites e validação de uploads | F0 | Parcial | Limite de corpo 10 MB; uploads de ficheiros pendentes |
| VRB-044-003 | Arquivar antes de eliminar; histórico de valores | F0 | Verificado | `setArchived`; `T-ANA` |
| VRB-044-004 | Backup completo e restauro ensaiado | F7 | Pendente | Procedimento manual `pg_dump` documentado no README |
| VRB-044-005 | Limitação de tentativas de login | F0 | Implementado | `@fastify/rate-limit` (10/min) |
| VRB-045-001 | Entidades do modelo de dados | TX | Parcial | Ver DATA_DICTIONARY.md (implementadas vs. pendentes) |
| VRB-045-002 | Módulos separados (autorização, edição, bibliografia, experimento, cálculos, publicação, exportações) | F0 | Verificado | `src/server/modules/*` |
| VRB-046-001 | Fluxo Escrever | F1 | Parcial | Sem cartão de ideia; restante verificado (`E2E`) |
| VRB-046-002 | Fluxo Investigar | F3 | Parcial | Sem figura; restante verificado |
| VRB-046-003 | Fluxo Excel | F5 | Verificado | `E2E`, `XLSX` |
| VRB-046-004 | Fluxo Atualizar (corrigir → impacto → recalcular → publicar) | F4 | Verificado | `T-ANA` (histórico + dependentes) |
| VRB-046-005 | Fluxo Entregar (DOCX/PDF) | F7 | Parcial | Exportar DOCX/PDF de rascunho ou publicação verificado (`T-DOC`, `E2E`); perfil institucional e auditoria de pendências pendentes |
| VRB-047-001 | Critérios de aceitação APA (lista da secção 47) | F2 | Verificado | `T-APA`, `T-ACAD` |
| VRB-047-002 | Critérios de dados e cálculos | F4 | Verificado | `T-CALC` |
| VRB-047-003 | Critérios Excel e documentos | F5 | Parcial | XLSX e DOCX/PDF verificados; importação (conflitos) pendente |
| VRB-047-004 | Critérios de acesso e publicação | F1 | Parcial | Backup/restauro pendente |

## 48–50. Fases, entregáveis, sucesso

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-048-001 | Fases entregam fluxos utilizáveis; pendências documentadas com motivo | TX | Verificado | Este ficheiro, PROGRESS.md |
| VRB-049-001 | Código, esquema, migrações, instruções, ambiente, fórmulas, versão APA, matriz, testes | TX | Verificado | README, docs/*, `migrations/`, `tests/` |
| VRB-049-002 | Guia do autor | F7 | Parcial | README §Utilização; guia dedicado pendente |
| VRB-050-001 | Critério de sucesso global | TX | Parcial | Ver PROGRESS.md |

## 51–65. Núcleo transversal

| ID | Requisito | Fase | Estado | Evidência |
|---|---|---|---|---|
| VRB-051-001 | Corrigir autor atualiza citações do rascunho, mantendo publicações | TX | Verificado | `T-ACAD` |
| VRB-051-002 | Nova colheita atualiza análises privadas dependentes | TX | Verificado | Indicadores calculados a pedido; `T-ANA` |
| VRB-051-003 | Excel usa a mesma base e versão do cálculo | TX | Verificado | `XLSX` |
| VRB-051-004 | “De onde veio / onde é usado / o que muda / versão publicada” | TX | Parcial | Registos de dados (Histórico/Onde é utilizado); fontes (ocorrências) |
| VRB-052-001 | Aba Memória do projeto com registos datados, origem e estatuto | TX | Pendente | O contexto relatado da secção 52 **não** foi introduzido como dados: aguarda o módulo e confirmação do autor |
| VRB-052-002 | Pistas bibliográficas por verificar, sem referências fictícias | TX | Pendente | Nenhuma referência foi criada a partir das pistas |
| VRB-053-001 | Caixa de entrada universal com proposta estruturada | TX | Pendente | — |
| VRB-054-001 | KnowledgeItem, Claim, EvidenceLink, Decision, ExtractionCandidate, Dependency | TX | Pendente | — |
| VRB-055-001 | Fonte adicionada → duplicados e validação | TX | Verificado | `T-ACAD` |
| VRB-055-002 | Metadados alterados → reformatar citações | TX | Verificado | `T-ACAD` |
| VRB-055-003 | Capítulo reordenado → índice e referências cruzadas | TX | Verificado | `T-ACAD` |
| VRB-055-004 | Medição válida → recalcular análises privadas | TX | Verificado | `T-ANA` |
| VRB-055-005 | Custo repartido → validar totais | TX | Verificado | `T-ANA` |
| VRB-055-006 | Registo corrigido → histórico e impacto | TX | Verificado | `T-ANA` |
| VRB-055-007 | Exportação → fixar versão, gerar, validar | TX | Verificado | `T-ANA`, `XLSX` |
| VRB-055-008 | Publicação → snapshot com autorização explícita | TX | Verificado | Confirmação na interface; `T-ACAD` |
| VRB-055-009 | Falha de processamento preservada e repetível | TX | Implementado | Fila com erro, retentativas e estado “falhou” |
| VRB-056-001 | Idempotência das tarefas | TX | Verificado | `T-ANA` (Idempotency-Key) |
| VRB-056-002 | Estados pendente/a processar/concluída/falhou/cancelada | TX | Implementado | `job.status` |
| VRB-056-003 | Mudança de fórmula exige nova versão | TX | Implementado | `FORMULA_VERSION` gravado em indicadores, Excel e publicações |
| VRB-056-004 | Números digitados em texto livre não apresentados como sincronizados | TX | Implementado | Só citações/xref são objetos ligados |
| VRB-057-001 | “Perguntar ao meu projeto” (sem IA obrigatória) | TX | Pendente | — |
| VRB-058-001 | Painel com próximas ações concretas | TX | Parcial | Fontes por confirmar, despesas sem repartição, ausência de água, secções “precisa de fonte”, erros da auditoria académica (`T-AUD`) |
| VRB-058-002 | “Continuar de onde fiquei” | TX | Implementado | Botão no painel (última secção editada) |
| VRB-058-003 | Plano de dados em falta | TX | Parcial | Estados “dados insuficientes” com explicação; plano dedicado pendente |
| VRB-059-001 | Pacote Power BI (tabelas normalizadas + dicionário) | TX | Parcial | XLSX normalizado com IDs e dicionário; sem .pbix (não afirmado) |
| VRB-059-002 | API só de leitura para BI | TX | Opcional | Pendente |
| VRB-060-001 | Módulo de operação/logística/modelo de negócio | TX | Opcional | Pendente |
| VRB-061-001 | Comparações ambientais só com baseline e fronteiras | TX | Implementado | Nenhuma alegação ambiental gerada; unidades “por ciclo” |
| VRB-062-001 | Matriz de cobertura com estados distintos | TX | Verificado | Este ficheiro; página “Cobertura” |
| VRB-062-002 | Registo de decisões e lacunas | TX | Verificado | DECISIONS.md |
| VRB-063-A | Cenário A (fonte → monografia) | TX | Parcial | Sem extração de relatório (Entrada) |
| VRB-063-B | Cenário B (cultivo → Excel → publicação) | TX | Parcial | Sem gráfico; restante verificado |
| VRB-063-C | Cenário C (correção → revisão) | TX | Parcial | Histórico e impacto verificados; sinalização da discussão pendente |
| VRB-063-D | Cenário D (falta de dados de água) | TX | Verificado | `T-CALC` |
| VRB-063-E | Cenário E (memória) | TX | Pendente | — |
| VRB-063-F | Cenário F (entrega) | TX | Parcial | DOCX/PDF e publicação com a mesma versão de origem (`T-DOC`); perfil institucional pendente |
| VRB-064-001 | Estado do sistema para o autor (processamento, erros, backups) | TX | Parcial | `/api/health`; lista de tarefas nas Exportações |
| VRB-064-002 | Integrações indisponíveis não bloqueiam escrita | TX | Verificado | Sem integrações obrigatórias |
| VRB-065-001 | Rastreabilidade de todas as secções até à conclusão | TX | Verificado | Este ficheiro |

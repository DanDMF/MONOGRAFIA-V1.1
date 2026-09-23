# CLAUDE.md — VRBAN

## Arranque de cada sessão
1. Ler `docs/PROGRESS.md` (estado real e próxima tarefa) e os requisitos pendentes relevantes em `docs/REQUIREMENTS.md`.
2. A especificação vinculativa é `docs/VRBAN_SPEC.md` (protocolo A–H + secções 1–65): ler integralmente no primeiro arranque e reler as secções relevantes antes de cada tarefa. Não recomeçar o projeto nem repetir decisões já registadas em `docs/DECISIONS.md`.
3. `git status` e `git log` antes de editar; preservar trabalho existente.

## Comandos verificados
- `npm run typecheck` · `npm test` (usa `TEST_DATABASE_URL`, que é apagada e recriada) · `npm run check`
- `npm run db:migrate` · `npm run dev` · `npm run build` · `npm start` · `npm run start:worker`
- `npm run author:provision -- --email … --name … --project <slug> [--create-project "<nome>"]`
- `npm run verify:xlsx -- <ficheiro.xlsx>` (openpyxl + LibreOffice) · `npm run e2e` (Playwright; `CHROMIUM_PATH` se necessário)
- `npm run docs:dictionary` após alterar `src/shared/entities.ts`

## Convenções permanentes
- Português de Portugal na interface, mensagens e documentação.
- Nunca inventar dados, referências, medições ou resultados; fixtures só em testes, identificadas como didáticas.
- Esquema: nova migração `migrations/NNNN_*.sql` para qualquer alteração (o migrador recusa editar migrações aplicadas). Nunca reset/destruição de dados sem autorização.
- Ausência = `NULL` (nunca zero); dinheiro/medições em `numeric`; moeda explícita; datas civis sem fuso.
- Toda a escrita passa por `requireProject(…, "write")`, validação zod e auditoria; operações compostas em `tx()`; concorrência otimista com `version`.
- Cálculos só em `src/server/modules/analysis/calc.ts`; alterar fórmula ⇒ incrementar `FORMULA_VERSION` + `docs/CALCULATIONS.md` + testes.
- Citações/referências cruzadas são nós com IDs; o texto é sempre renderizado pelo motor CSL (`bibliography/csl.ts`).
- Área pública lê apenas `publication_item`.
- Atualizar `docs/REQUIREMENTS.md` e `docs/PROGRESS.md` com evidência real (testes executados) ao concluir cada conjunto.

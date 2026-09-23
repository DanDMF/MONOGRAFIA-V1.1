# VRBAN — Centro Integrado de Investigação

> Repositório MONOGRAFIA-V1.1 — versão inicial da monografia 1.1.

Monografia interativa e centro de investigação sobre agricultura urbana vertical: editor académico com citações APA 7 ligadas à biblioteca, registos experimentais e financeiros, indicadores verificáveis, exportação Excel real e publicação por versões imutáveis.

- Especificação mestre: [`docs/VRBAN_SPEC.md`](docs/VRBAN_SPEC.md)
- Estado real e próxima tarefa: [`docs/PROGRESS.md`](docs/PROGRESS.md) · Matriz de requisitos: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)
- Arquitetura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Decisões: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Dados: [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) · Fórmulas: [`docs/CALCULATIONS.md`](docs/CALCULATIONS.md) · Exportações: [`docs/EXPORTS.md`](docs/EXPORTS.md)

## Requisitos

- Node.js ≥ 22.12 e npm
- PostgreSQL ≥ 14 (testado com 16.13)
- Opcional: LibreOffice Writer + módulo Python `uno` para exportar PDF (e Calc + `openpyxl` + `poppler-utils` para as verificações independentes); Chromium/Playwright para a verificação em browser.

## Configuração

```bash
npm install
cp .env.example .env          # preencher DATABASE_URL (e TEST_DATABASE_URL para testes)
npm run db:migrate            # aplica migrations/NNNN_*.sql (nunca apaga dados)
```

Criar a base e o utilizador PostgreSQL (exemplo local, credenciais só de desenvolvimento):

```bash
sudo -u postgres psql -c "create role vrban login password 'vrban' createdb"
sudo -u postgres psql -c "create database vrban owner vrban"
sudo -u postgres psql -c "create database vrban_test owner vrban"
```

### Provisionar o autor (não há registo público nem palavra-passe predefinida)

```bash
npm run author:provision -- --email autor@exemplo.org --name "Nome do Autor" --project vrban --create-project "VRBAN"
# a palavra-passe (≥ 12 caracteres) é pedida no terminal (ou lida de VRBAN_AUTHOR_PASSWORD)
```

O comando cria a conta (se não existir), cria o projeto com o modelo “Monografia empírica” (estrutura e orientações; **sem texto nem dados inventados**) e concede o papel `author`. Um revisor é acrescentado inserindo uma linha em `project_member` com papel `reviewer` (a interface de convites está pendente).

## Executar

Desenvolvimento (API :3000, cliente Vite :5173 com proxy, worker):

```bash
npm run dev
```

Produção local:

```bash
npm run build                 # cliente em dist/client + servidor em dist/server
NODE_ENV=production npm start # serve API e cliente compilado
npm run start:worker          # processo separado para a fila (exportações)
```

Em `NODE_ENV=production` os cookies passam a `Secure` (usar HTTPS atrás de um proxy).

## Verificações

| Comando | O que verifica |
|---|---|
| `npm run typecheck` | TypeScript estrito (servidor e cliente) |
| `npm test` | 82 testes: APA 7, cálculos, documento, percursos académico e analítico e exportação DOCX/PDF via API com PostgreSQL real (`TEST_DATABASE_URL`, **a base de testes é apagada e recriada**) |
| `npm run check` | typecheck + testes |
| `npm run verify:xlsx -- ficheiro.xlsx` | Releitura independente (openpyxl) e recálculo das fórmulas no LibreOffice sem cache |
| `CHROMIUM_PATH=… BASE=http://localhost:3000 EMAIL=… PASSWORD=… npm run e2e` | Percursos completos num browser real, telemóvel e teclado (cria dados de verificação no projeto indicado: usar uma base de desenvolvimento) |
| `npm run docs:dictionary` | Regenera `docs/DATA_DICTIONARY.md` a partir de `src/shared/entities.ts` |

Ainda não existe configuração ESLint (ver DECISIONS D-012).

## Utilização (guia rápido do autor)

1. **Definições** (Gestão → Perfil e definições): título académico, autor (apelido/nome para “Como citar”), instituição, perfil de citação (pt-PT ou inglês).
2. **Biblioteca**: “+ Nova fonte” ou “Importar” (BibTeX/RIS/CSL-JSON com pré-visualização). Duplicados são assinalados e fundidos com pré-visualização, preservando citações.
3. **Estrutura e editor**: abrir uma secção; escrever; “Inserir citação” (parentética, narrativa, direta curta, em bloco, fonte secundária, comunicação pessoal) com pré-visualização APA. A gravação é automática e o estado indica quando o servidor confirmou. “Guardar versão” cria um marco; “Versões” compara e restaura sem apagar.
4. **Experimento**: locais → estruturas (áreas de implantação e cultivo distintas) → culturas → ciclos → colheitas/consumos/trabalho/registos de campo. Campos vazios significam “não registado”.
5. **Análise**: despesas → repartições por ciclo (soma ≤ 100%) → **Indicadores** (cada valor abre fórmula, dados usados e exclusões).
6. **Exportações**: XLSX (escopo, modo, resumo prévio) e documento académico Word/PDF (rascunho ou versão publicada; perfil APA de estudante). Na Biblioteca, “Exportar…” gera BibTeX/RIS/CSL-JSON.
7. **Publicação**: selecionar secções (e, opcionalmente, indicadores) e publicar. O site público (`/p/<slug>`) mostra só versões publicadas; rascunhos posteriores não o alteram. Versões podem ser retiradas ou reapresentadas.

## Backups e restauro (procedimento manual — sistema automático pendente)

Um backup completo tem **duas partes**: base de dados e diretório de ficheiros.

```bash
pg_dump --format=custom --file=vrban-$(date +%F).dump "$DATABASE_URL"
tar czf vrban-ficheiros-$(date +%F).tgz -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
```

Restauro numa base **vazia**:

```bash
pg_restore --no-owner --dbname="$DATABASE_URL" vrban-AAAA-MM-DD.dump
tar xzf vrban-ficheiros-AAAA-MM-DD.tgz -C "$(dirname "$STORAGE_DIR")"
```

Este procedimento ainda não foi ensaiado com relatório de integridade (requisito VRB-044-004 pendente). Um download de exportação não é um backup.

## Alojamento

Não há dependência de plataforma. Necessário: Node 22, PostgreSQL, um processo web e um worker, e um **volume persistente** para `STORAGE_DIR` (discos efémeros perdem ficheiros; alternativa S3-compatível pendente). Nada foi publicado na internet nesta fase.

## Estrutura

```
migrations/            esquema SQL versionado
src/shared/            definições partilhadas (entidades, documento, modelos, diff)
src/server/            Fastify: http/, modules/, auth/, db/, lib/, worker.ts, scripts/
src/client/            React: páginas públicas e privadas, editor TipTap
tests/                 Vitest (unitários e integração com PostgreSQL)
scripts/               verificação XLSX, e2e em browser, gerador do dicionário
vendor/csl/            estilo APA 7 e locales CSL fixados (SHA256SUMS)
docs/                  especificação, requisitos, arquitetura, decisões, progresso
```

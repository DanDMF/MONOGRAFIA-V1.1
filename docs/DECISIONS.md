# Registo de decisões e lacunas

Formato: pergunta → decisão (provisória ou firme) → fundamento → alternativas → implicações. Estado: **Firme** / **Provisória** / **Lacuna**.

## D-001 · Stack · Firme (2026-09-23)
- **Decisão:** TypeScript em todo o código; Fastify 5 (servidor), React 19 + Vite 8 (cliente), PostgreSQL 16, `pg` com SQL explícito, zod 4.
- **Fundamento:** secção C da especificação; o SQL explícito mantém as regras de integridade visíveis (triggers, restrições).
- **Alternativas:** Next.js (acopla renderização e servidor), ORM (Prisma/Drizzle): adiado, porque as migrações SQL legíveis e os triggers simplificam a auditoria.
- **Implicações:** tipos das linhas escritos à mão; validação obrigatória com zod nas fronteiras.

## D-002 · Migrações · Firme
- Migrador próprio (`src/server/db/migrate.ts`): aplica `migrations/NNNN_*.sql` em transação, com bloqueio consultivo e checksum; recusa migrações já aplicadas que tenham sido alteradas. Nunca faz reset.
- Nota de sessão: durante a primeira sessão, antes de qualquer commit, as migrações 0001–0004 foram ajustadas e a base **local de desenvolvimento, vazia**, foi recriada. A partir do primeiro commit, qualquer alteração ao esquema exige nova migração.

## D-003 · Autenticação · Firme
- argon2id (`@node-rs/argon2`) + sessões em PostgreSQL (token aleatório no cookie; SHA-256 na base), rate-limit no login, provisionamento por CLI (`npm run author:provision`). Não existe registo público.
- **Alternativa considerada:** better-auth/lucia. A especificação pede uma “biblioteca consolidada”: usamos bibliotecas consolidadas para as primitivas (argon2, `@fastify/cookie`, `@fastify/rate-limit`) e mantemos a gestão de sessões mínima e auditável. Uma migração para uma biblioteca de autenticação completa (OAuth, 2FA) fica **Provisória** e só se justifica se forem necessários fornecedores externos.

## D-004 · Motor APA · Firme
- citeproc-js (pacote npm `citeproc` 2.4.63, processador 1.4.61) com `vendor/csl/apa.csl` (CSL APA 7.ª ed., `<updated>` 2026-02-07, SHA-256 em `vendor/csl/SHA256SUMS`) e locales `pt-PT`/`en-US` do repositório oficial CSL (obtidos em 2026-09-23).
- **Complementos próprios, com testes:** narrativa com “e”/“and” (o estilo usa “&”); ordem dos itens dentro do parêntese igual à da lista (o citeproc manteve a ordem de inserção para o mesmo autor); siglas institucionais na 1.ª ocorrência; fontes secundárias (“como citado em”/“as cited in”); comunicações pessoais (fora da lista).
- `s.d.` provém do termo `no date` (forma curta) do locale pt-PT; `n.d.` do en-US.
- Localizador “secção” é apresentado pelo estilo como “Secção X”: aceite, e documentado como limitação.
- “Como citar este projeto” usa o tipo CSL `document` com `version` (o tipo `webpage` no estilo APA não mostra a versão).

## D-005 · Citações como nós do documento + índice derivado · Firme
- O nó guarda IDs e atributos; o texto é sempre renderizado. O índice `citation` é reconstruído a cada gravação (fonte única: o documento). IDs duplicados (texto copiado entre secções) são reatribuídos pelo servidor e o documento corrigido é devolvido ao cliente.

## D-006 · Autosave e revisões · Firme
- Gravação automática 1,5 s após parar de escrever; revisões automáticas do mesmo autor com menos de 10 min são coalescidas; “Guardar versão” cria sempre um marco. Evita milhares de revisões sem perder marcos.

## D-007 · Indicadores · Firme
- Motor puro em `analysis/calc.ts` (decimal.js), versão `FORMULA_VERSION = 2026.09-1`, calculado a pedido (sem cache) → dados privados sempre atuais; publicações guardam snapshot.
- Depreciação por ciclo: ativos ligados à estrutura do ciclo × duração do ciclo (meses de 30,4375 dias) × fração de área. É uma **regra de repartição por área e tempo**, documentada; outras regras de afetação de ativos ficam como Lacuna L-004.
- Moedas diferentes nunca são agregadas; conversão por `exchange_rate` ainda não é aplicada (Lacuna L-003).

## D-008 · Excel · Firme
- exceljs 4.4.0. Folha `Indicadores` com “Valor calculado pelo sistema”, “Valor reproduzido no Excel (fórmula)” (SUMIFS/INDEX/MATCH, compatíveis com Excel 2010+, sem XLOOKUP) e “Diferença”; `fullCalcOnLoad=1`; resultados em cache coerentes com o servidor.
- Verificação independente: `scripts/verify_xlsx.py` (openpyxl) + recálculo com LibreOffice **depois de remover os valores em cache**.
- Aviso `npm audit`: exceljs depende de `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq, falta de verificação de limites quando é passado `buf` em v3/v5/v6). O exceljs usa `v4` sem `buf`; risco avaliado como não explorável neste uso. A correção proposta pelo npm é um *downgrade* para exceljs 3.4.0 (rejeitada). Rever quando houver versão corrigida.

## D-009 · Fila em PostgreSQL · Firme
- Sem Redis. `SKIP LOCKED`, idempotência por chave, retentativas exponenciais, recuperação de órfãs. Suficiente para exportações e extrações de um autor.

## D-010 · Armazenamento · Provisória
- `LocalStorage` (escrita atómica por renomeação) em `STORAGE_DIR`. **Em alojamento, os discos efémeros perdem os ficheiros**: é necessário um volume persistente ou a implementação S3-compatível (pendente, interface pronta).

## D-011 · Docker · Provisória
- O contentor de desenvolvimento tem Docker CLI, mas o daemon não foi usado; o PostgreSQL local foi usado diretamente. Não é fornecido `docker-compose.yml` nesta fase para não documentar algo não verificado.

## D-012 · Lint · Lacuna
- Ainda sem ESLint/Prettier. A verificação estática atual é `tsc --strict` com `noUncheckedIndexedAccess` (servidor e cliente). Adicionar ESLint numa próxima sessão.

## D-013 · Dados de demonstração · Provisória
- Nenhum dado demo foi criado no projeto real. Os testes usam bases isoladas (`TEST_DATABASE_URL`, recriada) e fixtures didáticas. A verificação em browser usou o projeto local de desenvolvimento com fixtures identificadas como didáticas, **removíveis** (a base local não é produção).

## D-014 · Secção 52 (memória do projeto) · Lacuna
- O contexto relatado pelo autor não foi introduzido como dados nem como referências: aguarda o módulo “Memória do projeto” e a confirmação do autor sobre origem e estatuto de cada registo.

## D-015 · Documento académico DOCX/PDF · Firme (2026-09-23)
- DOCX com a biblioteca `docx` (estilos e numeração reais, campo TOC); PDF produzido pelo LibreOffice a partir do mesmo DOCX via UNO (`scripts/lo_convert.py`), que atualiza os índices antes de exportar. Assim, DOCX e PDF partilham a mesma fonte e o mesmo layout.
- **Alternativas:** PDF direto (pdfmake/Chromium print) — rejeitado, porque obrigaria a manter dois layouts. Pandoc — não instalado e com menos controlo sobre os estilos APA.
- Fonte Times New Roman 12 pt (APA permite outras fontes legíveis; o perfil institucional poderá alterar); A4 por omissão (contexto Angola/Portugal).
- A publicação passa a guardar o documento estruturado (`doc`) e o mapa de citações no snapshot, para exportar exatamente a versão publicada; estes campos não são servidos nas rotas públicas.

## Lacunas abertas

| ID | Pergunta | Impacto | Decisão provisória |
|---|---|---|---|
| L-001 | Regulamento institucional (margens, capa, numeração) | Exportação académica | Perfil APA de estudante até o autor fornecer o regulamento |
| L-002 | Destino de alojamento | Armazenamento, HTTPS, backups | Adiar até o sistema local estar completo |
| L-003 | Conversão cambial em agregados | Indicadores multi-moeda | Recusar agregação; mostrar estado “moedas mistas” |
| L-004 | Regras de afetação de ativos além da área × tempo | Depreciação | Área × tempo por estrutura |
| L-005 | Integração DOI/Crossref | Metadados | Introdução manual/importação |
| L-006 | Serviço de IA/OCR | Entrada, assistente | Desativado; sem envio de dados |

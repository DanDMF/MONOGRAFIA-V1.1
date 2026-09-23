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

## D-016 · Guia APA e auditoria académica · Firme (2026-09-24)
- **Exemplos do guia**: obras fictícias definidas em memória (`apa-guide.ts`) e renderizadas pelo mesmo motor CSL do projeto, isoladamente por regra. O guia não pode divergir do que o sistema produz e os exemplos nunca são gravados.
- **Ligações oficiais**: o site APA Style responde 200 a qualquer caminho (inclusive inexistente) e está protegido por um desafio anti-bot (Incapsula); o `curl`, o WebFetch e o Chromium (CA do proxy) não conseguiram ler o conteúdo. Para não apresentar URLs não verificados, cada regra indica o **caminho do tópico** no APA Style e a página liga ao índice oficial (`/style-grammar-guidelines`). O autor pode acrescentar ligações específicas depois de as confirmar.
- **Auditoria**: calculada a pedido (sem cache), com chaves estáveis `verificação:alvo`; as justificações ficam em `audit_exception` (migração 0005), auditadas e revogáveis; só é possível justificar avisos existentes. Siglas: heurística (2–6 maiúsculas; definidas por “Extenso (SIGLA)”, “SIGLA (extenso)” ou pela sigla de um autor institucional citado); gera avisos de *revisão humana*, nunca erros. Numerais romanos e códigos comuns (APA, DOI, URL, ISBN, PDF, AOA, EUR, USD) ignorados.
- **Desempenho**: o painel executa a auditoria completa em cada carregamento (inclui renderização CSL do projeto). Adequado à escala de uma monografia; se ficar lento, guardar o resultado em cache invalidada por gravação.
- A publicação **não é bloqueada** por avisos (decisão do autor); a página de publicação mostra o resumo antes de publicar.

## D-017 · Alojamento sem computador (Render) · Provisória (2026-09-24)
- O autor não tem computador: a aplicação tem de arrancar sem terminal. Acrescentado: `MIGRATE_ON_START` (migrações no arranque), `RUN_WORKER_IN_PROCESS` (fila no processo web: um único serviço), `STORAGE_DRIVER=db` (ficheiros em `stored_blob`, migração 0006, porque discos gratuitos são efémeros), provisionamento inicial por `VRBAN_BOOTSTRAP_*` **apenas quando a base não tem contas** (palavra-passe do ambiente, mínimo 12 caracteres; ignorado depois), `RENDER_EXTERNAL_URL` como endereço público por omissão.
- `Dockerfile` (Node 22 bookworm-slim + `libreoffice-writer-nogui` + `python3-uno` + `fonts-liberation`, ~1 GB) e `render.yaml` (web Docker + PostgreSQL, plano gratuito). Verificado localmente com Docker: 6 migrações e conta criadas numa base vazia, `scripts/e2e-browser.mjs` completo contra o contentor, PDF gerado no contentor, ficheiros e conta preservados após reinício, pico de memória ~340 MB durante a conversão PDF.
- O teste local exigiu um Dockerfile auxiliar (não versionado) com a CA/proxy do ambiente de desenvolvimento, o espelho `public.ecr.aws` (limite de pedidos do Docker Hub) e fontes apt em HTTPS; o `Dockerfile` do repositório não depende disso.
- **Paragem ordenada (corrigido na sessão 3):** com a fila no mesmo processo, o `SIGTERM` era intercetado e o servidor não terminava (o alojamento teria de o matar à força, podendo cortar uma exportação). Agora `SIGTERM`/`SIGINT` fecham o servidor HTTP, esperam a tarefa em curso, fecham a base e saem (limite de 25 s). Verificado localmente.
- **Alternativas:** Railway/Fly.io (semelhantes; exigem CLI ou cartão em alguns casos), VPS (exige terminal). Render escolhido por permitir tudo pelo navegador do telemóvel. **Riscos:** limites do plano gratuito (adormecimento, prazo da base, memória); preços e limites a confirmar pelo autor.

## D-018 · Prioridades: o software segue a monografia · Firme (2026-09-24)
- **Decisão do autor:** não completar os requisitos pendentes por ordem da matriz, mas pelos que permitem escrever já. Ordem: (1) proteger o código (tag estável + PR para `main`); (2) pôr online **como ambiente de trabalho/teste**; (3) Próximo parágrafo (VRB-012-001: ideia → fonte → leitura → notas → parágrafo → revisão, o método “1% por dia”); (4) notas/conceitos + ficha de leitura + matriz da literatura (VRB-022-002, VRB-012-003, VRB-012-004); (5) perfil institucional logo que exista regulamento (VRB-003-*); (6) importação Excel/CSV, tabelas, figuras e gráficos; (7) cenários, VAL/TIR, câmbio quando houver dados; (8) OCR, IA, galeria, DOI automático por último.
- **Backups passam a requisito essencial** antes de dados experimentais insubstituíveis no alojamento gratuito: enquanto não houver backup automático ensaiado (VRB-044-004), o autor mantém os dados originais fora do sistema e faz exportações regulares.
- **Fundamento:** “2/3 dos requisitos” não é “2/3 do trabalho útil”; os módulos de planeamento da escrita são os de uso diário.

## D-019 · Unidade de investigação; integrada ⇒ arquivada · Firme (2026-09-24)
- **Decisão do autor:** o objeto é uma **unidade de investigação** (ideia → pesquisa → leitura → notas → redação → revisão → integrado); o “cartão” é apenas a interface. Ao ser integrada, a unidade é **arquivada automaticamente como histórico/evidência** (só leitura) e o sistema volta ao próximo passo.
- **Interface:** o centro visual continua a ser o texto e o próximo passo. A página “Próximo parágrafo” mostra a unidade sugerida (ação com data mais próxima → etapa mais avançada → mais recente), a nova ideia e uma lista curta do que está em curso. **Não há quadro de colunas.** Histórico (integradas) e “arquivadas sem integrar” ficam atrás de ligações.
- **Evidência:** uma unidade integrada não se edita nem se “restaura”; só se **reabre para revisão** (retira a integração e o arquivo; o parágrafo fica na secção). Uma unidade pode ser arquivada sem integrar (ideia posta de lado) e restaurada.
- **Nomes técnicos:** tabela `paragraph_card` e rotas `/api/…/cards` mantêm-se (renomear não traz valor e obrigaria a migrar dados); a migração 0008 documenta o conceito e arquiva as integradas anteriores. Rotas da interface: `/app/escrita/unidades`.

## Lacunas abertas

| ID | Pergunta | Impacto | Decisão provisória |
|---|---|---|---|
| L-001 | Regulamento institucional (margens, capa, numeração) | Exportação académica | Perfil APA de estudante até o autor fornecer o regulamento |
| L-002 | Destino de alojamento | Armazenamento, HTTPS, backups | Adiar até o sistema local estar completo |
| L-003 | Conversão cambial em agregados | Indicadores multi-moeda | Recusar agregação; mostrar estado “moedas mistas” |
| L-004 | Regras de afetação de ativos além da área × tempo | Depreciação | Área × tempo por estrutura |
| L-005 | Integração DOI/Crossref | Metadados | Introdução manual/importação |
| L-006 | Serviço de IA/OCR | Entrada, assistente | Desativado; sem envio de dados |

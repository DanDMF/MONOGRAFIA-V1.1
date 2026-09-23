# Arquitetura — VRBAN

## Visão geral

Uma aplicação modular num único repositório (sem microserviços):

```
Browser (React SPA, Vite)
  ├── Site público  /p/:slug/…          → lê só /api/public/* (snapshots publicados)
  └── Área privada  /app/…              → /api/projects/:projectId/* (sessão + autorização)
                    │
Servidor HTTP (Fastify, TypeScript) ── src/server/app.ts
  ├── http/            rotas finas: validação (zod), autorização, transações
  ├── modules/
  │   ├── entities/        CRUD genérico com regras de domínio (experimento, finanças, excertos)
  │   ├── content/         secções, revisões, índice de citações, renderização HTML
  │   ├── bibliography/    referências, CSL/APA (citeproc-js), importadores/exportadores, Guia APA
  │   ├── audit/           auditoria académica (verificações, gravidade, exceções justificadas)
  │   ├── analysis/        motor de indicadores (puro), serviço, dependências
  │   ├── exports/         XLSX (exceljs), CSV protegido, documento académico DOCX (docx) e PDF (LibreOffice/UNO)
  │   ├── publication/     snapshots imutáveis e leitura pública
  │   └── jobs/            fila persistente em PostgreSQL
  ├── auth/            argon2id + sessões em base (token só no cookie; hash na base)
  └── lib/             auditoria, armazenamento (interface), erros, validação
                    │
PostgreSQL 16 ── migrations/NNNN_*.sql (migrador próprio com checksum)
Armazenamento ── interface Storage (LocalStorage: STORAGE_DIR)
Worker ── src/server/worker.ts (mesma base; processa a fila)
Partilhado ── src/shared/* (definições de entidades, documento, modelos, diff): usado por servidor e cliente
```

## Base canónica e relações

- Cada objeto tem UUID estável. Relações por chave estrangeira; o serviço genérico verifica que referências pertencem ao **mesmo projeto** (isolamento).
- `src/shared/entities.ts` é a definição única dos campos de dados: valida no servidor, gera formulários no cliente, alimenta a folha `Dicionario` do Excel e `docs/DATA_DICTIONARY.md` (`npm run docs:dictionary`).
- Documento das secções: JSON estruturado (ProseMirror/TipTap). Citações e referências cruzadas são **nós com atributos** (IDs), nunca texto digitado. O texto da citação é calculado pelo motor APA a partir da biblioteca no momento da renderização → corrigir metadados atualiza todas as ocorrências.
- Índice de citações (`citation`, `citation_item`) reconstruído a cada gravação da secção, em transação; permite “onde é citada?” e bibliografia por escopo.

## Persistência, versões e concorrência

| Objeto | Versões | Concorrência |
|---|---|---|
| Secção (conteúdo) | `section_revision` (autosave coalescido 10 min; marcos explícitos; restauro cria nova revisão) | `baseVersion` → 409 com conteúdo do servidor |
| Registos de dados | `audit_event` com `before`/`after` | `version` otimista → 409 |
| Referências | `audit_event` | `version` otimista → 409 |
| Publicação | `publication` + `publication_item` imutáveis (trigger bloqueia UPDATE) | número sequencial por projeto |
| Protocolo | `protocol_version` imutável (nova versão) | — |

Valores ausentes são `NULL`; `numeric` para montantes/medições (strings no Node, sem perda); datas civis (`date`) tratadas como texto `AAAA-MM-DD` sem fuso; instantes em `timestamptz`.

## Autorização

- Sessão: cookie `vrban_session` (httpOnly, SameSite=Lax, Secure em produção); token aleatório de 256 bits; na base só o SHA-256.
- `requireProject(ctx, req, "read" | "write")`: exige membro ativo em `project_member`; `write` só para `author`. Revisor: leitura.
- CSRF: todos os pedidos não-GET em `/api` exigem `X-Requested-With: vrban` (força pré-verificação CORS em origens externas).
- Downloads (`/files/:id`) passam pela mesma autorização; exportações expiram em 7 dias.
- Área pública: apenas `publication_item` de publicações não retiradas; nenhuma rota pública lê tabelas de rascunho.

## Publicação

`createPublication` (transação): renderiza citações com o escopo selecionado (bibliografia só das obras citadas nesse escopo), converte cada secção para HTML com o renderizador partilhado, inclui antepassados como títulos, grava manifesto (revisões de origem, estilo CSL com SHA-256, versão do cálculo, avisos de citação) e opcionalmente o snapshot dos indicadores sem IDs privados. `project.current_publication_id` define a versão apresentada; versões anteriores continuam acessíveis em `/p/:slug/v/:n` até serem retiradas.

## Fila e automatizações

`job` com `FOR UPDATE SKIP LOCKED`, `idempotency_key` única, tentativas com espera exponencial (`2^n × 5 s`), recuperação de tarefas órfãs (>15 min em “running”), cancelamento cooperativo. Tipos atuais: `export.xlsx`, `export.document` (DOCX/PDF).

| Evento | Automático | Decisão humana |
|---|---|---|
| Fonte criada/importada | Normalizar DOI, detetar duplicados, registar origem | Confirmar identidade; fundir com pré-visualização |
| Metadados alterados | Citações e bibliografia do rascunho recalculadas | Rever desambiguação |
| Secção gravada | Revisão, contagem de palavras, índice de citações, reatribuição de IDs duplicados | Estado declarado, marcos |
| Capítulo reordenado | Numeração e referências cruzadas | Estrutura |
| Colheita/despesa/repartição | Indicadores recalculados a pedido; soma de repartições validada (serviço + trigger) | Critério de afetação |
| Correção | Histórico antes/depois; mapa de impacto; publicações possivelmente desatualizadas | Rever texto; publicar nova versão |
| Exportação | Fila, ficheiro com SHA-256, auditoria | Escopo e privacidade |
| Publicação | Snapshot imutável; resumo da auditoria académica apresentado antes | Autorização explícita |
| Auditoria académica | 17 verificações classificadas (estrutural / incompleta / revisão) | Corrigir ou justificar exceção (auditada, revogável) |

## Cliente

React 19 + React Router 7. Editor TipTap 3 carregado a pedido (bloco separado). Formulários genéricos gerados de `entities.ts`. Preferências de leitura em `localStorage` (conveniência, nunca estado essencial). Cópia de emergência do rascunho em `localStorage`, nunca apresentada como “gravado”.

## Pendências arquiteturais

Armazenamento de objetos (S3-compatível), perfil institucional, importação Excel/CSV, conhecimento/afirmações, caixa de entrada, backups automáticos — ver REQUIREMENTS.md.

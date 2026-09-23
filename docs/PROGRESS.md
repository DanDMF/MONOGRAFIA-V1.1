# Progresso — estado real

**Última verificação:** 2026-09-24 (sessão 2). Branch `claude/vrban-centro-investigacao-i1gip3`.

## Ambiente verificado (sessão 1)

- Linux (contentor na cloud), Node 22.22.2, npm 10.9.7, PostgreSQL 16.13 local (cluster iniciado manualmente com `pg_ctlcluster 16 main start`), Chromium 1194 do Playwright em `/opt/pw-browsers/chromium`.
- O LibreOffice existia só como núcleo (não abria ficheiros); foram instalados `libreoffice-calc`, `libreoffice-writer` e `poppler-utils` via apt (verificação XLSX, conversão PDF, renderização de páginas). **Noutra máquina/contentor, esta instalação tem de ser repetida.** O módulo Python `uno` estava disponível no `python3` do sistema.
- Python 3.11 com `openpyxl` instalado via pip (para `scripts/verify_xlsx.py`).
- Docker CLI presente; daemon não utilizado.
- Repositório inicial: apenas `README.md` (2 linhas) e um commit.

## Utilizável agora

- **Acesso:** login do autor provisionado; papel revisor só de leitura; CSRF; sessões seguras.
- **Percurso académico (verificado):** biblioteca (criar/editar/importar/duplicados/fusão) → estrutura (modelo “Monografia empírica”, reordenar, renomear, subsecções, arquivar) → editor TipTap com autosave, conflitos, cópia local de emergência, versões/diff/restauro, citações APA (6 modalidades, localizadores, pré-visualização), referências cruzadas por ID → bibliografia automática → publicação por snapshot → site público (início, monografia com índice, referências, resultados, versões, “Como citar”, preferências de leitura).
- **Guia APA e auditoria académica (verificado, sessão 2):** 15 regras com origem/versão/data e exemplos didáticos gerados pelo motor; 17 verificações classificadas por gravidade, com exceções justificadas e revogáveis; aviso antes de publicar e no painel.
- **Alojamento (preparado e verificado localmente, sessão 2):** `Dockerfile` + `render.yaml` + arranque sem terminal; guia só com telemóvel em `docs/DEPLOY.md`. **Ainda não publicado online**: depende de o autor criar a conta no Render.
- **Documentos (verificado):** DOCX/PDF (perfil APA de estudante) a partir do rascunho ou de uma versão publicada; exportação BibTeX/RIS/CSL-JSON.
- **Percurso analítico (verificado):** protocolo, variáveis, locais, estruturas, culturas, ciclos, registos de campo, colheitas, consumos, trabalho, despesas, repartições, ativos, vendas, câmbio → indicadores com estados explicados e rastreio de entradas → exportação XLSX pela fila (e CSV protegido).
- **Transversal:** histórico com antes/depois, “Onde é utilizado” (impacto), painel com próximas ações e “Continuar de onde fiquei”.

## Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | sem erros |
| `npm test` | **94/94** (8 ficheiros: apa 23, calc 17, doc 7, académico 20, analítico 11, documento DOCX/PDF 4, auditoria/guia 8, alojamento 4) |
| Contentor de produção (sessão 2) | `docker build` + arranque numa base vazia (migrações e conta automáticas), verificação completa em browser contra o contentor, PDF no contentor, ficheiros e conta preservados após reinício, pico ~340 MB |
| Guia APA e auditoria no browser (sessão 2) | Chromium: guia com exemplos, auditoria, justificar e revogar exceção, telemóvel sem deslocamento horizontal, sem erros na consola |
| `npm run build` | sem erros (editor num bloco separado de 426 kB) |
| `scripts/verify_xlsx.py` sobre o XLSX dos testes e sobre o XLSX descarregado no browser | OK; o LibreOffice recalculou as fórmulas dos indicadores **sem cache** e coincidem com o sistema |
| Exportação académica | DOCX com estilos reais verificado por XML; PDF (LibreOffice/UNO) com índice preenchido, texto selecionável, fontes Liberation Serif incorporadas, A4; **páginas renderizadas e inspecionadas visualmente** (título, índice, corpo com níveis APA e citação em bloco, referências com recuo francês) |
| `scripts/e2e-browser.mjs` (Chromium) | OK: login, fonte, escrita, citação parentética e narrativa, persistência após recarregar, publicação, leitura pública, rascunho não altera publicado, formulários do percurso analítico, indicadores 500 AOA/kg e 10 kg/m² (fixture), XLSX via fila, DOCX académico via fila, telemóvel 390 px sem deslocamento horizontal, menu recolhível, ligação de salto por teclado, sem erros na consola |

Capturas da verificação em browser (não versionadas): `tmp/shots/`.

**Não verificado:** modo escuro e escala de letra por inspeção visual; leitores de ecrã; RIS/CSL-JSON (implementados, sem teste dedicado); erro de gravação simulado no browser (coberto só na API); interface de conflito no browser (a lógica 409 está testada na API).

## Bloqueios e dependências

- Nenhum bloqueio no desenvolvimento local.
- Consulta de DOI (Crossref), IA/OCR e alojamento: dependências externas não configuradas (não bloqueiam o restante).
- Regulamento institucional não fornecido (afeta a exportação académica DOCX/PDF).

## Próxima tarefa executável (ordem do autor, D-018)

0. Código protegido: tag `v0.1.0` e PR para `main`.
1. **Autor:** seguir `docs/DEPLOY.md` e usar o Render **como ambiente de trabalho/teste**; sem dados insubstituíveis até existir backup (manter originais fora do sistema e exportar com regularidade).
2. **Próximo parágrafo** (VRB-012-001): cartões ideia → fonte → leitura → notas → parágrafo → revisão → integrado, ligados a fontes, excertos e secções.
3. Notas/conceitos (VRB-022-002), ficha de leitura (VRB-012-003) e matriz da literatura (VRB-012-004).
4. Perfil institucional (VRB-003-*) assim que houver regulamento/modelo oficial.
5. Backup completo descarregável e restauro ensaiado (VRB-044-004) — essencial antes de dados reais.
6. Importação Excel/CSV (VRB-039-*), tabelas/figuras/gráficos (VRB-021-002, VRB-035-*).
7. Cenários/VAL/TIR (VRB-032-*), câmbio (L-003) — quando houver dados.
8. OCR, IA, galeria, DOI automático; memória do projeto (VRB-052-*, só com confirmação do autor); ESLint (D-012).

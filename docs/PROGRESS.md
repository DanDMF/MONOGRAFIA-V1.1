# Progresso — estado real

**Última verificação:** 2026-09-23 (sessão 1). Branch `claude/vrban-centro-investigacao-i1gip3`.

## Ambiente verificado (sessão 1)

- Linux (contentor na cloud), Node 22.22.2, npm 10.9.7, PostgreSQL 16.13 local (cluster iniciado manualmente com `pg_ctlcluster 16 main start`), Chromium 1194 do Playwright em `/opt/pw-browsers/chromium`.
- O LibreOffice existia só como núcleo (não abria ficheiros); foram instalados `libreoffice-calc` e `libreoffice-writer` via apt para a verificação independente de XLSX. **Noutra máquina/contentor, esta instalação tem de ser repetida.**
- Python 3.11 com `openpyxl` instalado via pip (para `scripts/verify_xlsx.py`).
- Docker CLI presente; daemon não utilizado.
- Repositório inicial: apenas `README.md` (2 linhas) e um commit.

## Utilizável agora

- **Acesso:** login do autor provisionado; papel revisor só de leitura; CSRF; sessões seguras.
- **Percurso académico (verificado):** biblioteca (criar/editar/importar/duplicados/fusão) → estrutura (modelo “Monografia empírica”, reordenar, renomear, subsecções, arquivar) → editor TipTap com autosave, conflitos, cópia local de emergência, versões/diff/restauro, citações APA (6 modalidades, localizadores, pré-visualização), referências cruzadas por ID → bibliografia automática → publicação por snapshot → site público (início, monografia com índice, referências, resultados, versões, “Como citar”, preferências de leitura).
- **Percurso analítico (verificado):** protocolo, variáveis, locais, estruturas, culturas, ciclos, registos de campo, colheitas, consumos, trabalho, despesas, repartições, ativos, vendas, câmbio → indicadores com estados explicados e rastreio de entradas → exportação XLSX pela fila (e CSV protegido).
- **Transversal:** histórico com antes/depois, “Onde é utilizado” (impacto), painel com próximas ações e “Continuar de onde fiquei”.

## Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | sem erros |
| `npm test` | **76/76** (5 ficheiros: apa 21, calc 17, doc 7, académico 20, analítico 11) |
| `npm run build` | sem erros (editor num bloco separado de 426 kB) |
| `scripts/verify_xlsx.py` sobre o XLSX dos testes e sobre o XLSX descarregado no browser | OK; o LibreOffice recalculou as fórmulas dos indicadores **sem cache** e coincidem com o sistema |
| `scripts/e2e-browser.mjs` (Chromium) | OK: login, fonte, escrita, citação parentética e narrativa, persistência após recarregar, publicação, leitura pública, rascunho não altera publicado, formulários do percurso analítico, indicadores 500 AOA/kg e 10 kg/m² (fixture), XLSX via fila, telemóvel 390 px sem deslocamento horizontal, menu recolhível, ligação de salto por teclado, sem erros na consola |

Capturas da verificação em browser (não versionadas): `tmp/shots/`.

**Não verificado:** modo escuro e escala de letra por inspeção visual; leitores de ecrã; RIS/CSL-JSON (implementados, sem teste dedicado); erro de gravação simulado no browser (coberto só na API); interface de conflito no browser (a lógica 409 está testada na API).

## Bloqueios e dependências

- Nenhum bloqueio no desenvolvimento local.
- Consulta de DOI (Crossref), IA/OCR e alojamento: dependências externas não configuradas (não bloqueiam o restante).
- Regulamento institucional não fornecido (afeta a exportação académica DOCX/PDF).

## Próxima tarefa executável

1. **Exportação académica DOCX/PDF** (VRB-040-001/002, VRB-021-001): gerar DOCX com `docx` a partir de uma publicação (estilos de título APA, citações renderizadas, bibliografia com recuo francês, perfil de estudante), converter para PDF com LibreOffice e **renderizar páginas para inspeção** antes de marcar como verificado.
2. Guia APA + auditoria académica agregada (VRB-020-*), exportação BibTeX/RIS/CSL-JSON (VRB-040-003).
3. Próximo parágrafo, notas/conceitos e ficha de leitura na interface (VRB-012-*).
4. Memória do projeto (VRB-052-*) com o contexto relatado da secção 52 inserido **apenas após confirmação do autor**.
5. Importação Excel/CSV com lotes anuláveis (VRB-039-*); gráficos (VRB-035-*); cenários (VRB-032-*); backups ensaiados (VRB-044-004); ESLint (D-012).

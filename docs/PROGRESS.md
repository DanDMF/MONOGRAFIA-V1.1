# Progresso — estado real

**Última verificação:** 2026-09-23 (sessão 1). Branch `claude/vrban-centro-investigacao-i1gip3`.

## Ambiente verificado (sessão 1)

- Linux (contentor na cloud), Node 22.22.2, npm 10.9.7, PostgreSQL 16.13 local (cluster iniciado manualmente com `pg_ctlcluster 16 main start`), Chromium 1194 do Playwright em `/opt/pw-browsers/chromium`.
- O LibreOffice existia só como núcleo (não abria ficheiros); foram instalados `libreoffice-calc`, `libreoffice-writer` e `poppler-utils` via apt (verificação XLSX, conversão PDF, renderização de páginas). **Noutra máquina/contentor, esta instalação tem de ser repetida.** O módulo Python `uno` estava disponível no `python3` do sistema.
- Python 3.11 com `openpyxl` instalado via pip (para `scripts/verify_xlsx.py`).
- Docker CLI presente; daemon não utilizado.
- Repositório inicial: apenas `README.md` (2 linhas) e um commit.

## Utilizável agora

- **Acesso:** login do autor provisionado; papel revisor só de leitura; CSRF; sessões seguras.
- **Percurso académico (verificado):** biblioteca (criar/editar/importar/duplicados/fusão) → estrutura (modelo “Monografia empírica”, reordenar, renomear, subsecções, arquivar) → editor TipTap com autosave, conflitos, cópia local de emergência, versões/diff/restauro, citações APA (6 modalidades, localizadores, pré-visualização), referências cruzadas por ID → bibliografia automática → publicação por snapshot → site público (início, monografia com índice, referências, resultados, versões, “Como citar”, preferências de leitura).
- **Documentos (verificado):** DOCX/PDF (perfil APA de estudante) a partir do rascunho ou de uma versão publicada; exportação BibTeX/RIS/CSL-JSON.
- **Percurso analítico (verificado):** protocolo, variáveis, locais, estruturas, culturas, ciclos, registos de campo, colheitas, consumos, trabalho, despesas, repartições, ativos, vendas, câmbio → indicadores com estados explicados e rastreio de entradas → exportação XLSX pela fila (e CSV protegido).
- **Transversal:** histórico com antes/depois, “Onde é utilizado” (impacto), painel com próximas ações e “Continuar de onde fiquei”.

## Verificações executadas nesta sessão

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | sem erros |
| `npm test` | **82/82** (6 ficheiros: apa 23, calc 17, doc 7, académico 20, analítico 11, documento DOCX/PDF 4) |
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

## Próxima tarefa executável

1. **Guia APA + auditoria académica agregada** (VRB-020-*): página de auditoria com citações desligadas, referências não citadas, localizadores em falta, DOI malformados, níveis de título saltados, classificados (erro estrutural / informação incompleta / revisão humana) com justificação de exceções.
2. Próximo parágrafo, notas/conceitos e ficha de leitura na interface (VRB-012-*); matriz da literatura.
3. Perfil institucional (VRB-003-*) aplicado à exportação DOCX/PDF (margens, capa, numeração), com diferenças face à APA visíveis.
4. Memória do projeto (VRB-052-*) com o contexto relatado da secção 52 inserido **apenas após confirmação do autor**.
5. Importação Excel/CSV com lotes anuláveis (VRB-039-*); tabelas/figuras e gráficos (VRB-021-002, VRB-035-*); cenários (VRB-032-*); backups ensaiados (VRB-044-004); ESLint (D-012).

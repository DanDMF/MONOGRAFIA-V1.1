# Contratos de exportação

## XLSX — implementado e verificado

Gerador: `src/server/modules/exports/excel.ts` (exceljs 4.4.0). Pedido: `POST /api/projects/:id/exports/xlsx` (fila; cabeçalho `Idempotency-Key` opcional) → `GET /jobs/:jobId` → `GET /files/:fileId` (autenticado, válido 7 dias). Pré-visualização do escopo: `POST /exports/xlsx/preview`.

Opções (`excelExportSchema`): `cycleIds?` (omisso = toda a investigação), `sheets?`, `mode` (`values` | `formulas` | `both`), `includePrivate` (omissão: `false`), `template` (modelo vazio).

### Folhas

`LEIA_ME`, `Metadados`, `Dicionario`, `Locais`, `Estruturas`, `Culturas`, `Ciclos`, `Registos_Campo`, `Colheitas`, `Consumos`, `Trabalho`, `Ativos`, `Despesas`, `Reparticoes`, `Vendas`, `Taxas_Cambio`, `Indicadores`, `Formulas`, `Referencias`.
**Pendentes:** `Resumo`, `Cenarios`, `Citacoes`, `Matriz_Objetivos`, `Qualidade`.

### Garantias (verificadas por `tests/analytic-flow.test.ts` e `scripts/verify_xlsx.py`)

- Uma linha por observação; coluna `ID` (UUID, texto) em todas as folhas de dados; relações por IDs.
- Números como números; datas civis como datas (`yyyy-mm-dd`); booleanos; percentagens formatadas (`share`, `area_fraction`).
- Célula vazia = não registado (nunca zero).
- Cabeçalhos com unidade, primeira linha fixa, filtro automático, larguras.
- Texto do utilizador escrito como texto (uma nota `=HYPERLINK(...)` fica como texto `s`).
- Sem macros nem ligações externas; `fullCalcOnLoad="1"`.
- Campos privados (`supplier_private`, `coords_private`, `private_contact`) excluídos por omissão.
- `Reparticoes` inclui valor, moeda, operacionalidade e substituição da despesa, e a fórmula `share × valor`.
- `Indicadores`: valor do sistema; fórmula de reprodução; diferença (deve ser 0). Fórmulas: `SUMIFS` sobre `Colheitas` e `Reparticoes`, `INDEX/MATCH` sobre `Ciclos`/`Estruturas`, razões entre células. Indicadores sem fórmula (depreciação, consumos) ficam só com o valor do sistema e a definição.
- Recálculo independente: LibreOffice recalcula a partir das folhas (com a cache removida) e coincide com o sistema dentro de 1e-9 relativo.

### Limitações atuais
- Sem gráficos nativos.
- Sem divisão automática em várias folhas/ZIP para volumes muito grandes (volume de um projeto de monografia é pequeno); CSV limitado a 5 000 linhas por pedido.
- “Pacote público de uma versão publicada” ainda não implementado.

## CSV — implementado e verificado

`POST /api/projects/:id/exports/csv/:entity` com `ids?` (seleção/filtro atual) e `excelCompat` (omissão: `true` → separador `;`, BOM UTF-8). Células de texto que começam por `= + - @ TAB CR` recebem prefixo `'` (proteção contra injeção de fórmulas). Campos privados nunca incluídos.

## DOCX / PDF — implementado e verificado

Pedido: `POST /api/projects/:id/exports/document` (fila `export.document`) com `source` (`draft` | `publication`), `publicationNumber`, `sectionIds?` (rascunho; omissão = secções com texto), `format` (`docx` | `pdf`), `titlePage`, `toc`, `numberHeadings`. Gerador: `modules/exports/docx.ts` (biblioteca `docx` 9.7); fonte: `modules/exports/academic.ts`; PDF: `lib/office.ts` → `scripts/lo_convert.py` (LibreOffice via UNO, perfil temporário isolado).

**Perfil aplicado (APA 7, documento de estudante)**: A4; margens 2,54 cm; Times New Roman 12 pt (no LibreOffice, Liberation Serif com métricas compatíveis); espaçamento duplo; recuo da primeira linha 1,27 cm; número de página no canto superior direito; sem *running head*; página de título com os elementos existentes (título a negrito, autor, instituição, grau, orientação, ano); capítulos em página nova.

**Títulos**: `Heading1` centrado, negrito · `Heading2` à esquerda, negrito · `Heading3` à esquerda, negrito itálico · níveis 4 e 5 em linha (negrito / negrito itálico, terminam em ponto, o texto continua na mesma linha). O nível depende da profundidade da secção; os títulos T2–T5 do editor ficam abaixo do título da secção. A numeração dos capítulos é opção institucional (`numberHeadings`) e segue a numeração da estrutura completa (um capítulo não exportado deixa um salto na numeração).

**Conteúdo**: citações e bibliografia renderizadas pelo mesmo motor CSL, com o escopo exportado (só obras citadas nas secções incluídas; comunicações pessoais fora da lista); citação curta entre aspas; citação em bloco com recuo de 1,27 cm e parêntese após a pontuação; listas numeradas/com marcas; referências cruzadas com o rótulo atual; bibliografia na posição da secção “Referências” (ou no fim), com recuo francês de 1,27 cm e itálicos do estilo.

**Sumário**: campo TOC (níveis 1–3) com `updateFields` — o Word pede para atualizar os campos ao abrir. No PDF, o índice é atualizado pelo LibreOffice (duas passagens) antes da exportação.

**Origem**: as propriedades do documento indicam a origem (“Publicação vN (data)” ou “rascunho … (revisões: secção #n)”); o resultado da tarefa guarda o mesmo manifesto. A exportação a partir de uma publicação usa o documento estruturado guardado no snapshot (publicações anteriores a esta funcionalidade exigem nova publicação).

**Verificação**: `tests/document-export.test.ts` inspeciona o XML (estilos, campo TOC, `updateFields`, citações, referências, itálicos) e o PDF (`pdftotext`, `pdffonts` com todas as fontes incorporadas, `pdfinfo`); páginas renderizadas com `pdftoppm` e inspecionadas visualmente nesta sessão.

**Limitações**: sem perfil institucional (margens, capa e numeração específicas da universidade); sem tabelas, figuras, legendas, notas de rodapé, listas de tabelas/figuras; citações são texto renderizado (não campos Zotero — a bibliografia estruturada exporta-se em BibTeX/RIS/CSL-JSON); PDF requer LibreOffice Writer e o módulo Python `uno` no servidor (sem eles, a tarefa falha com mensagem explícita e o DOCX continua disponível).

## Bibliografia — implementado e verificado

`GET /api/projects/:id/references-export?format=bibtex|ris|csl-json&scope=library|cited`. CSL-JSON gerado a partir da mesma conversão usada pelo motor APA; BibTeX com autores institucionais protegidos por chavetas; RIS com AU/ED/TI/T2/PY/VL/IS/SP/EP/PB/DO/UR/SN/LA. Ida e volta verificada com os importadores (`tests/apa.test.ts`).

## Markdown / pacote ZIP reproduzível — pendentes

- **Markdown/HTML** com ligações internas e citações preservadas.
- **Pacote reproduzível**: README, dados autorizados, dicionário, fórmulas, referências e metadados de versão.

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

## DOCX / PDF / Markdown / pacote ZIP — pendentes

Contrato previsto (a verificar quando implementado):
- **DOCX** (`docx`): estilos reais de título (níveis APA 1–5), sumário atualizável (campo TOC: o Word pede para atualizar campos), citações renderizadas (não campos Zotero), bibliografia com recuo francês 1,27 cm, espaçamento duplo, margens 2,54 cm (perfil APA de estudante), sem running head por omissão.
- **PDF**: conversão do DOCX com LibreOffice (`soffice --headless --convert-to pdf`) e inspeção de páginas renderizadas (overflow de tabelas, quebras) antes de marcar como concluída.
- **Bibliografia**: exportação BibTeX/RIS/CSL-JSON.
- **Pacote reproduzível**: README, dados autorizados, dicionário, fórmulas, referências e metadados de versão.

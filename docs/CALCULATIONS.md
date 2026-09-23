# Cálculos — versão `2026.09-1`

Implementação: `src/server/modules/analysis/calc.ts` (funções puras, `decimal.js`). Serviço: `indicators-service.ts`. Testes: `tests/calc.test.ts` (+ integração em `tests/analytic-flow.test.ts`).

## Regras gerais

1. **Ausência ≠ zero.** Campos vazios são `NULL`; somas usam só valores presentes e reportam `coverage = {used, total}` e estado `partial`.
2. **Estados explicados** em vez de infinitos: `insufficient_data`, `zero_denominator`, `mixed_currency`, `non_positive`.
3. **Moedas nunca misturadas**: custos e receitas agrupados por moeda; razões só com uma moeda.
4. **Razões agregadas** = Σ numeradores / Σ denominadores (nunca média de razões).
5. **Por ciclo, não anualizado.**
6. **Precisão:** decimal com 20 algarismos significativos; arredondamento só na apresentação.
7. **Rastreabilidade:** cada resultado lista `inputs` (tabela + ID) e `formulaVersion`.

## Indicadores por ciclo

| Código | Fórmula | Unidade | Notas |
|---|---|---|---|
| PROD_MKT | Σ `harvest.marketable_kg` | kg | colheitas sem valor não contam como zero |
| PROD_GROSS | Σ `harvest.gross_kg` | kg | |
| LOSS_WEIGHT | Σ rejeitado / Σ bruto (colheitas com ambos) | fração | perda de peso, não de plantas |
| YIELD_FOOTPRINT | PROD_MKT / (`structure.footprint_area_m2` × `cycle.area_fraction`) | kg/m² por ciclo | |
| YIELD_CULTIVATION | PROD_MKT / (`structure.cultivation_area_m2` × `cycle.area_fraction`) | kg/m² por ciclo | a área de cultivo já agrega os níveis |
| OPCOST | Σ (`expense.amount` × `allocation.share`), despesas operacionais, por moeda | moeda | exclui estimativas substituídas (`replaces_expense_id`) |
| COST_PER_KG | OPCOST / PROD_MKT | moeda/kg | `mixed_currency` se >1 moeda |
| DEPRECIATION | Σ ((custo + instalação − residual) / vida útil em meses) × meses do ciclo × fração | moeda | visão económica; nunca somada à aquisição; ativos da estrutura do ciclo |
| REVENUE | Σ `sale.amount` do ciclo, por moeda | moeda | colheita não gera receita |
| OP_BALANCE | REVENUE − OPCOST (mesma moeda) | moeda | |
| OP_MARGIN | OP_BALANCE / REVENUE (REVENUE > 0) | fração | não é retorno sobre custo |
| WATER_PER_KG | Σ litros (m³ × 1000) / PROD_MKT | L/kg | sem medições → explicação, sem valor da literatura |
| ENERGY_PER_KG | Σ kWh (Wh / 1000; ou potência × horas / 1000, identificado) / PROD_MKT | kWh/kg | |
| LABOR_PER_KG | Σ horas / PROD_MKT | h/kg | pagas e não pagas |

Meses do ciclo: `(fim − início + 1 dia) / 30,4375`.

## Agregados

| Código | Fórmula |
|---|---|
| PROD_MKT_TOTAL | Σ PROD_MKT dos ciclos |
| COST_PER_KG_AGG | Σ OPCOST / Σ PROD_MKT (uma moeda) |

## Cenários (funções disponíveis)

| Código | Fórmula | Estados |
|---|---|---|
| CONTRIB_MARGIN_UNIT | preço unitário − custo variável unitário | |
| BREAK_EVEN_QTY | custos fixos / margem de contribuição unitária | `non_positive` se margem ≤ 0 |

## Casos de teste (didáticos, isolados)

| Caso | Esperado |
|---|---|
| 100 kg, 50 000 Kz, 10 m² | 500 Kz/kg; 10 kg/m² |
| Colheitas 40 kg + (sem valor) | PROD_MKT = 40, `partial`, cobertura 1/2 |
| Produção 0 kg | COST_PER_KG `zero_denominator` |
| Despesa 1000 repartida 0,6/0,4 | soma dos OPCOST = 1000 |
| Repartição 0,25 | 750 não atribuídos |
| AOA + EUR | `mixed_currency` |
| Estimativa 40 000 substituída por fatura 50 000 | OPCOST = 50 000 |
| Ativo 120 000, 60 meses, ciclo 30 dias, fração 0,5 | ≈ 985,63 (2000 × 30/30,4375 × 0,5) |
| Ciclos 50 000/100 kg e 40 000/400 kg | agregado 180 (não 300) |
| Margem de contribuição 0 | equilíbrio `non_positive` |

## Reprodução no Excel

A folha `Indicadores` contém fórmulas reais (ver `docs/EXPORTS.md`). Tolerância documentada: diferença relativa ≤ 1e-9. Verificado com `scripts/verify_xlsx.py` (LibreOffice recalcula sem cache).

## Alterar uma fórmula

1. Alterar `calc.ts` e incrementar `FORMULA_VERSION`.
2. Atualizar esta página, a folha `Formulas` (`excel.ts`) e os testes.
3. Publicações anteriores mantêm o valor e a versão com que foram geradas.

// Motor de indicadores verificáveis (secção 30). Funções puras, sem acesso à base: testáveis e reproduzíveis.
// Regras: ausência ≠ zero; denominador zero/ausente → estado explicado; moedas nunca misturadas;
// razões agregadas = soma(numerador)/soma(denominador), nunca média de razões; aquisição ≠ depreciação.
import { Decimal } from "decimal.js";

export const FORMULA_VERSION = "2026.09-1";

export type IndicatorStatus =
  | "ok"
  | "partial" // calculado com dados incompletos (cobertura indicada)
  | "insufficient_data"
  | "zero_denominator"
  | "mixed_currency"
  | "non_positive"
  | "not_applicable";

export interface InputRef {
  table: string;
  id: string;
}

export interface IndicatorResult {
  code: string;
  label: string;
  unit: string;
  status: IndicatorStatus;
  value: string | null; // decimal em string (precisão total); arredondamento só na apresentação
  numerator?: string | null;
  denominator?: string | null;
  currency?: string | null;
  formula: string;
  formulaVersion: string;
  inputs: InputRef[];
  notes: string[];
  coverage?: { used: number; total: number };
}

export interface HarvestIn {
  id: string;
  harvest_date: string;
  gross_kg: string | null;
  marketable_kg: string | null;
  rejected_kg: string | null;
}
export interface ExpenseIn {
  id: string;
  amount: string;
  currency: string;
  is_operational: boolean;
  cost_behavior: "fixed" | "variable";
  category: string;
  replaced: boolean; // estimativa substituída por fatura real (não conta)
}
export interface AllocationIn {
  id: string;
  expense_id: string;
  share: string;
}
export interface SaleIn {
  id: string;
  amount: string;
  currency: string;
  quantity: string;
  commercial_unit: string;
  kg_equivalent: string | null;
}
export interface ConsumptionIn {
  id: string;
  resource: "water" | "energy" | "other";
  quantity: string | null;
  unit: string;
  power_w: string | null;
  hours_used: string | null;
}
export interface LaborIn {
  id: string;
  hours: string;
  is_paid: boolean;
  hourly_rate: string | null;
  currency: string | null;
}
export interface AssetIn {
  id: string;
  cost: string;
  installation_cost: string | null;
  residual_value: string | null;
  useful_life_months: number | null;
  depreciation_method: "linear" | "none";
  currency: string;
  in_use_from: string | null;
}

export interface CycleInput {
  cycle: { id: string; code: string; area_fraction: string; start_date: string | null; end_date: string | null };
  structure: { id: string; footprint_area_m2: string | null; cultivation_area_m2: string | null; useful_area_m2: string | null };
  harvests: HarvestIn[];
  expenses: Map<string, ExpenseIn>;
  allocations: AllocationIn[]; // apenas as deste ciclo
  sales: SaleIn[];
  consumptions: ConsumptionIn[];
  labor: LaborIn[];
  assets: AssetIn[]; // ativos ligados à estrutura do ciclo
}

const D = (v: string | number) => new Decimal(v);
const s = (d: Decimal) => d.toString();

function result(partial: Omit<IndicatorResult, "formulaVersion" | "notes" | "inputs"> & Partial<IndicatorResult>): IndicatorResult {
  return { formulaVersion: FORMULA_VERSION, notes: [], inputs: [], ...partial };
}

/** Soma de um campo possivelmente nulo; devolve soma dos presentes e cobertura. */
function sumNullable<T extends { id: string }>(rows: T[], get: (r: T) => string | null) {
  let total = D(0);
  const used: T[] = [];
  for (const r of rows) {
    const v = get(r);
    if (v === null || v === undefined) continue;
    total = total.plus(v);
    used.push(r);
  }
  return { total, used, coverage: { used: used.length, total: rows.length } };
}

export function ratio(
  base: Omit<IndicatorResult, "status" | "value" | "formulaVersion" | "notes" | "inputs"> & { notes?: string[]; inputs?: InputRef[] },
  num: Decimal | null,
  den: Decimal | null,
  opts: { requirePositiveDen?: boolean } = {},
): IndicatorResult {
  const notes = [...(base.notes ?? [])];
  if (num === null || den === null) {
    return result({ ...base, status: "insufficient_data", value: null, numerator: num ? s(num) : null, denominator: den ? s(den) : null, notes });
  }
  if (den.isZero() || (opts.requirePositiveDen && den.lte(0))) {
    notes.push("Denominador igual a zero: o indicador não é definido.");
    return result({ ...base, status: "zero_denominator", value: null, numerator: s(num), denominator: s(den), notes });
  }
  return result({ ...base, status: "ok", value: s(num.div(den)), numerator: s(num), denominator: s(den), notes });
}

/** Custos operacionais atribuídos ao ciclo, por moeda (visão de caixa/consumo; sem ativos). */
export function allocatedCosts(input: CycleInput, filter: (e: ExpenseIn) => boolean = (e) => e.is_operational) {
  const byCurrency = new Map<string, Decimal>();
  const inputs: InputRef[] = [];
  const notes: string[] = [];
  for (const a of input.allocations) {
    const e = input.expenses.get(a.expense_id);
    if (!e || !filter(e)) continue;
    if (e.replaced) {
      notes.push(`Despesa ${e.id} excluída: estimativa substituída por documento real.`);
      continue;
    }
    const v = D(e.amount).times(a.share);
    byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? D(0)).plus(v));
    inputs.push({ table: "allocation", id: a.id }, { table: "expense", id: e.id });
  }
  return { byCurrency, inputs, notes };
}

function toLiters(c: ConsumptionIn): Decimal | null {
  if (c.quantity == null) return null;
  if (c.unit === "L") return D(c.quantity);
  if (c.unit === "m3") return D(c.quantity).times(1000);
  return null;
}
function toKwh(c: ConsumptionIn): { v: Decimal; estimated: boolean } | null {
  if (c.quantity != null) {
    if (c.unit === "kWh") return { v: D(c.quantity), estimated: false };
    if (c.unit === "Wh") return { v: D(c.quantity).div(1000), estimated: false };
  }
  if (c.power_w != null && c.hours_used != null) return { v: D(c.power_w).times(c.hours_used).div(1000), estimated: true };
  return null;
}

/** Meses (fracionários, 30,4375 dias) entre duas datas civis inclusivas. */
export function monthsBetween(start: string, end: string): Decimal {
  const a = Date.parse(start + "T00:00:00Z");
  const b = Date.parse(end + "T00:00:00Z");
  const days = (b - a) / 86_400_000 + 1;
  return D(days).div(30.4375);
}

export function computeCycleIndicators(input: CycleInput): IndicatorResult[] {
  const out: IndicatorResult[] = [];
  const hIds = input.harvests.map((h) => ({ table: "harvest", id: h.id }));

  // Produção
  const mkt = sumNullable(input.harvests, (h) => h.marketable_kg);
  const prodNotes: string[] = [];
  if (mkt.coverage.used < mkt.coverage.total)
    prodNotes.push(`${mkt.coverage.total - mkt.coverage.used} colheita(s) sem peso comercializável registado (não contadas como zero).`);
  const production: IndicatorResult = result({
    code: "PROD_MKT",
    label: "Produção comercializável",
    unit: "kg",
    status: mkt.coverage.total === 0 || mkt.used.length === 0 ? "insufficient_data" : mkt.coverage.used < mkt.coverage.total ? "partial" : "ok",
    value: mkt.used.length ? s(mkt.total) : null,
    formula: "Σ peso comercializável das colheitas do ciclo",
    inputs: mkt.used.map((h) => ({ table: "harvest", id: h.id })),
    notes: prodNotes,
    coverage: mkt.coverage,
  });
  out.push(production);
  const prodKg = production.value !== null ? D(production.value) : null;

  const gross = sumNullable(input.harvests, (h) => h.gross_kg);
  out.push(
    result({
      code: "PROD_GROSS",
      label: "Produção bruta",
      unit: "kg",
      status: gross.used.length === 0 ? "insufficient_data" : gross.coverage.used < gross.coverage.total ? "partial" : "ok",
      value: gross.used.length ? s(gross.total) : null,
      formula: "Σ peso bruto das colheitas do ciclo",
      inputs: gross.used.map((h) => ({ table: "harvest", id: h.id })),
      coverage: gross.coverage,
    }),
  );

  // Perdas de peso (não confundir com perda de plantas)
  const both = input.harvests.filter((h) => h.gross_kg != null && h.rejected_kg != null);
  out.push(
    ratio(
      {
        code: "LOSS_WEIGHT",
        label: "Perda de peso na colheita",
        unit: "fração (0–1)",
        formula: "Σ peso rejeitado / Σ peso bruto (colheitas com ambos os valores)",
        inputs: both.map((h) => ({ table: "harvest", id: h.id })),
        notes: ["Base: peso bruto colhido. Não inclui perdas de plantas antes da colheita."],
      },
      both.length ? both.reduce((a, h) => a.plus(h.rejected_kg!), D(0)) : null,
      both.length ? both.reduce((a, h) => a.plus(h.gross_kg!), D(0)) : null,
    ),
  );

  // Áreas atribuídas (área da estrutura × fração usada pelo ciclo; nunca × níveis de novo)
  const frac = D(input.cycle.area_fraction);
  const footprint = input.structure.footprint_area_m2 != null ? D(input.structure.footprint_area_m2).times(frac) : null;
  const cultivation = input.structure.cultivation_area_m2 != null ? D(input.structure.cultivation_area_m2).times(frac) : null;
  const areaInputs = [{ table: "structure", id: input.structure.id }, { table: "cycle", id: input.cycle.id }];
  out.push(
    ratio(
      {
        code: "YIELD_FOOTPRINT",
        label: "Produtividade por área de implantação",
        unit: "kg/m² por ciclo",
        formula: "Produção comercializável / (área de implantação × fração da área do ciclo)",
        inputs: [...hIds, ...areaInputs],
        notes: ["Por ciclo (não anualizado)."],
      },
      prodKg,
      footprint,
    ),
  );
  out.push(
    ratio(
      {
        code: "YIELD_CULTIVATION",
        label: "Produtividade por área de cultivo",
        unit: "kg/m² por ciclo",
        formula: "Produção comercializável / (área total de cultivo × fração da área do ciclo)",
        inputs: [...hIds, ...areaInputs],
        notes: ["Área de cultivo soma as superfícies dos níveis; não comparar com kg/m² de implantação."],
      },
      prodKg,
      cultivation,
    ),
  );

  // Custos operacionais atribuídos e custo por kg
  const costs = allocatedCosts(input);
  const currencies = [...costs.byCurrency.keys()];
  for (const [cur, total] of costs.byCurrency) {
    out.push(
      result({
        code: "OPCOST",
        label: "Custos operacionais atribuídos",
        unit: cur,
        currency: cur,
        status: "ok",
        value: s(total),
        formula: "Σ (valor da despesa operacional × fração atribuída ao ciclo)",
        inputs: costs.inputs,
        notes: costs.notes,
      }),
    );
  }
  if (currencies.length === 0) {
    out.push(
      result({
        code: "OPCOST",
        label: "Custos operacionais atribuídos",
        unit: "—",
        status: "insufficient_data",
        value: null,
        formula: "Σ (valor da despesa operacional × fração atribuída ao ciclo)",
        notes: ["Sem despesas operacionais atribuídas a este ciclo."],
      }),
    );
  }
  const costBase = {
    code: "COST_PER_KG",
    label: "Custo operacional por kg",
    formula: "Custos operacionais atribuídos / produção comercializável correspondente",
    inputs: [...costs.inputs, ...hIds],
  };
  if (currencies.length > 1) {
    out.push(
      result({
        ...costBase,
        unit: "—",
        status: "mixed_currency",
        value: null,
        notes: [`Custos em várias moedas (${currencies.join(", ")}): converter com taxa explícita antes de agregar.`],
      }),
    );
  } else {
    const cur = currencies[0] ?? null;
    out.push(ratio({ ...costBase, unit: cur ? `${cur}/kg` : "—/kg", currency: cur, notes: production.notes }, cur ? costs.byCurrency.get(cur)! : null, prodKg));
  }

  // Depreciação linear (visão económica, separada da caixa): ativos da estrutura × fração × duração do ciclo
  const dep = depreciationForCycle(input);
  out.push(...dep);

  // Receita realizada, saldo e margem (por moeda)
  const revenue = new Map<string, Decimal>();
  for (const sale of input.sales) revenue.set(sale.currency, (revenue.get(sale.currency) ?? D(0)).plus(sale.amount));
  const saleInputs = input.sales.map((x) => ({ table: "sale", id: x.id }));
  if (revenue.size === 0) {
    out.push(
      result({
        code: "REVENUE",
        label: "Receita realizada",
        unit: "—",
        status: "insufficient_data",
        value: null,
        formula: "Σ vendas efetivas do ciclo",
        notes: ["Sem vendas registadas. Colheitas não geram receita realizada."],
      }),
    );
  }
  for (const [cur, rev] of revenue) {
    out.push(result({ code: "REVENUE", label: "Receita realizada", unit: cur, currency: cur, status: "ok", value: s(rev), formula: "Σ vendas efetivas do ciclo", inputs: saleInputs }));
    const cost = costs.byCurrency.get(cur);
    if (currencies.length <= 1 && cost !== undefined) {
      const bal = rev.minus(cost);
      out.push(
        result({
          code: "OP_BALANCE",
          label: "Saldo operacional",
          unit: cur,
          currency: cur,
          status: "ok",
          value: s(bal),
          formula: "Receita realizada − custos operacionais atribuídos",
          inputs: [...saleInputs, ...costs.inputs],
        }),
      );
      out.push(
        ratio(
          {
            code: "OP_MARGIN",
            label: "Margem operacional sobre a receita",
            unit: "fração (0–1)",
            currency: cur,
            formula: "Saldo operacional / receita realizada",
            inputs: [...saleInputs, ...costs.inputs],
            notes: ["Não é retorno sobre o custo."],
          },
          bal,
          rev,
          { requirePositiveDen: true },
        ),
      );
    }
  }

  // Consumos específicos
  const water = input.consumptions.filter((c) => c.resource === "water").map((c) => ({ c, l: toLiters(c) }));
  const waterOk = water.filter((w) => w.l !== null);
  out.push(
    ratio(
      {
        code: "WATER_PER_KG",
        label: "Consumo de água por kg",
        unit: "L/kg",
        formula: "Σ água (L) atribuída ao ciclo / produção comercializável",
        inputs: [...waterOk.map((w) => ({ table: "consumption", id: w.c.id })), ...hIds],
        notes: water.length === 0 ? ["Sem medições de água associadas ao ciclo: registar a variável no protocolo antes de calcular."] : [],
      },
      waterOk.length ? waterOk.reduce((a, w) => a.plus(w.l!), D(0)) : null,
      prodKg,
    ),
  );
  const energy = input.consumptions.filter((c) => c.resource === "energy").map((c) => ({ c, k: toKwh(c) }));
  const energyOk = energy.filter((e) => e.k !== null);
  out.push(
    ratio(
      {
        code: "ENERGY_PER_KG",
        label: "Consumo de energia por kg",
        unit: "kWh/kg",
        formula: "Σ energia (kWh; medida ou potência × horas) / produção comercializável",
        inputs: [...energyOk.map((e) => ({ table: "consumption", id: e.c.id })), ...hIds],
        notes: [
          ...(energy.length === 0 ? ["Sem registos de energia associados ao ciclo."] : []),
          ...(energyOk.some((e) => e.k!.estimated) ? ["Inclui estimativas por potência × tempo de utilização."] : []),
        ],
      },
      energyOk.length ? energyOk.reduce((a, e) => a.plus(e.k!.v), D(0)) : null,
      prodKg,
    ),
  );
  out.push(
    ratio(
      {
        code: "LABOR_PER_KG",
        label: "Trabalho por kg",
        unit: "h/kg",
        formula: "Σ horas de trabalho do ciclo (pago e não pago) / produção comercializável",
        inputs: [...input.labor.map((l) => ({ table: "labor_entry", id: l.id })), ...hIds],
        notes: input.labor.length === 0 ? ["Sem registos de trabalho."] : [],
      },
      input.labor.length ? input.labor.reduce((a, l) => a.plus(l.hours), D(0)) : null,
      prodKg,
    ),
  );
  return out;
}

export function depreciationForCycle(input: CycleInput): IndicatorResult[] {
  const { start_date, end_date } = input.cycle;
  const base = {
    code: "DEPRECIATION",
    label: "Depreciação atribuída (linear)",
    formula: "Σ ((custo + instalação − valor residual) / vida útil em meses) × duração do ciclo em meses × fração da área",
  };
  const eligible = input.assets.filter((a) => a.depreciation_method === "linear");
  if (!eligible.length) return [];
  if (!start_date || !end_date) {
    return [result({ ...base, unit: "—", status: "insufficient_data", value: null, notes: ["Ciclo sem datas de início e fim: duração desconhecida."] })];
  }
  const months = monthsBetween(start_date, end_date);
  const by = new Map<string, Decimal>();
  const notes: string[] = [];
  const inputs: InputRef[] = [];
  for (const a of eligible) {
    if (!a.useful_life_months) {
      notes.push(`Ativo ${a.id} sem vida útil: excluído.`);
      continue;
    }
    const depreciable = D(a.cost).plus(a.installation_cost ?? 0).minus(a.residual_value ?? 0);
    if (depreciable.lte(0)) continue;
    const v = depreciable.div(a.useful_life_months).times(months).times(input.cycle.area_fraction);
    by.set(a.currency, (by.get(a.currency) ?? D(0)).plus(v));
    inputs.push({ table: "asset", id: a.id });
  }
  notes.push("Visão económica: não somar ao custo de aquisição do ativo (visão de caixa).");
  return [...by].map(([cur, v]) => result({ ...base, unit: cur, currency: cur, status: "ok", value: s(v), inputs, notes }));
}

/** Margem de contribuição unitária e ponto de equilíbrio em quantidade (cenários/pressupostos). */
export function breakEven(fixedCosts: string, unitPrice: string, unitVariableCost: string, unit = "kg"): IndicatorResult[] {
  const mc = D(unitPrice).minus(unitVariableCost);
  const mcRes = result({
    code: "CONTRIB_MARGIN_UNIT",
    label: "Margem de contribuição unitária",
    unit: `por ${unit}`,
    status: "ok",
    value: s(mc),
    formula: "Preço unitário − custo variável unitário",
  });
  if (mc.lte(0)) {
    return [
      mcRes,
      result({
        code: "BREAK_EVEN_QTY",
        label: "Equilíbrio em quantidade",
        unit,
        status: "non_positive",
        value: null,
        formula: "Custos fixos / margem de contribuição unitária",
        notes: ["Margem de contribuição não positiva: o equilíbrio não é atingível com estes pressupostos."],
      }),
    ];
  }
  return [mcRes, ratio({ code: "BREAK_EVEN_QTY", label: "Equilíbrio em quantidade", unit, formula: "Custos fixos / margem de contribuição unitária" }, D(fixedCosts), mc)];
}

/** Agregado de vários ciclos: razões agregadas (Σ custos / Σ kg), nunca média simples de custos/kg. */
export function aggregateIndicators(perCycle: { cycleId: string; results: IndicatorResult[] }[]): IndicatorResult[] {
  const get = (rs: IndicatorResult[], code: string) => rs.filter((r) => r.code === code && r.value !== null);
  let kg = D(0);
  let kgCycles = 0;
  const costBy = new Map<string, Decimal>();
  const inputs: InputRef[] = [];
  for (const c of perCycle) {
    const p = get(c.results, "PROD_MKT")[0];
    if (p) {
      kg = kg.plus(p.value!);
      kgCycles++;
      inputs.push(...p.inputs);
    }
    for (const oc of get(c.results, "OPCOST")) costBy.set(oc.currency!, (costBy.get(oc.currency!) ?? D(0)).plus(oc.value!));
  }
  const out: IndicatorResult[] = [
    result({
      code: "PROD_MKT_TOTAL",
      label: "Produção comercializável total",
      unit: "kg",
      status: kgCycles ? "ok" : "insufficient_data",
      value: kgCycles ? s(kg) : null,
      formula: "Σ produção comercializável dos ciclos selecionados",
      inputs,
      coverage: { used: kgCycles, total: perCycle.length },
    }),
  ];
  const curs = [...costBy.keys()];
  if (curs.length > 1) {
    out.push(
      result({
        code: "COST_PER_KG_AGG",
        label: "Custo operacional por kg (agregado)",
        unit: "—",
        status: "mixed_currency",
        value: null,
        formula: "Σ custos operacionais / Σ produção comercializável",
        notes: [`Moedas diferentes (${curs.join(", ")}).`],
      }),
    );
  } else {
    const cur = curs[0] ?? null;
    out.push(
      ratio(
        {
          code: "COST_PER_KG_AGG",
          label: "Custo operacional por kg (agregado)",
          unit: cur ? `${cur}/kg` : "—/kg",
          currency: cur,
          formula: "Σ custos operacionais / Σ produção comercializável (razão agregada, não média de razões)",
        },
        cur ? costBy.get(cur)! : null,
        kgCycles ? kg : null,
      ),
    );
  }
  return out;
}

/** Parte não atribuída de cada despesa (soma das frações < 1). */
export function unallocated(expenses: ExpenseIn[], allocations: AllocationIn[]) {
  return expenses
    .filter((e) => !e.replaced)
    .map((e) => {
      const share = allocations.filter((a) => a.expense_id === e.id).reduce((acc, a) => acc.plus(a.share), D(0));
      return { expenseId: e.id, currency: e.currency, allocatedShare: s(share), unallocatedAmount: s(D(e.amount).times(D(1).minus(share))) };
    })
    .filter((x) => D(x.unallocatedAmount).gt(0));
}

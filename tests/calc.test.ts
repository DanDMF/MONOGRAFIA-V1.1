// Testes de cálculos (secção 47 — Dados e cálculos). Valores exclusivamente didáticos.
import { describe, expect, it } from "vitest";
import {
  aggregateIndicators,
  breakEven,
  computeCycleIndicators,
  unallocated,
  type CycleInput,
  type ExpenseIn,
  type IndicatorResult,
} from "../src/server/modules/analysis/calc.js";

const exp = (id: string, amount: string, extra: Partial<ExpenseIn> = {}): ExpenseIn => ({
  id,
  amount,
  currency: "AOA",
  is_operational: true,
  cost_behavior: "variable",
  category: "seeds",
  replaced: false,
  ...extra,
});

function base(over: Partial<CycleInput> = {}): CycleInput {
  return {
    cycle: { id: "c1", code: "C1", area_fraction: "1", start_date: "2026-01-01", end_date: "2026-03-01" },
    structure: { id: "s1", footprint_area_m2: "10", cultivation_area_m2: "30", useful_area_m2: null },
    harvests: [{ id: "h1", harvest_date: "2026-02-01", gross_kg: "110", marketable_kg: "100", rejected_kg: "10" }],
    expenses: new Map([["e1", exp("e1", "50000")]]),
    allocations: [{ id: "a1", expense_id: "e1", share: "1" }],
    sales: [],
    consumptions: [],
    labor: [],
    assets: [],
    ...over,
  };
}
const get = (rs: IndicatorResult[], code: string) => rs.find((r) => r.code === code)!;

describe("teste didático isolado da especificação", () => {
  it("100 kg, 50 000 Kz, 10 m² de implantação → 500 Kz/kg e 10 kg/m²", () => {
    const r = computeCycleIndicators(base());
    expect(get(r, "PROD_MKT").value).toBe("100");
    expect(get(r, "COST_PER_KG").value).toBe("500");
    expect(get(r, "COST_PER_KG").unit).toBe("AOA/kg");
    expect(get(r, "YIELD_FOOTPRINT").value).toBe("10");
    expect(Number(get(r, "YIELD_CULTIVATION").value)).toBeCloseTo(100 / 30, 12);
    expect(Number(get(r, "LOSS_WEIGHT").value)).toBeCloseTo(10 / 110, 12);
  });
});

describe("ausência, zero e divisão por zero", () => {
  it("colheita sem peso comercializável não conta como zero", () => {
    const r = computeCycleIndicators(
      base({
        harvests: [
          { id: "h1", harvest_date: "2026-02-01", gross_kg: null, marketable_kg: "40", rejected_kg: null },
          { id: "h2", harvest_date: "2026-02-10", gross_kg: null, marketable_kg: null, rejected_kg: null },
        ],
      }),
    );
    const p = get(r, "PROD_MKT");
    expect(p.status).toBe("partial");
    expect(p.value).toBe("40");
    expect(p.coverage).toEqual({ used: 1, total: 2 });
    expect(get(r, "PROD_GROSS").status).toBe("insufficient_data");
    expect(get(r, "PROD_GROSS").value).toBeNull();
  });
  it("produção zero medida → custo/kg com denominador zero (sem infinito)", () => {
    const r = computeCycleIndicators(base({ harvests: [{ id: "h", harvest_date: "2026-02-01", gross_kg: "0", marketable_kg: "0", rejected_kg: "0" }] }));
    const c = get(r, "COST_PER_KG");
    expect(c.status).toBe("zero_denominator");
    expect(c.value).toBeNull();
    expect(get(r, "PROD_MKT").value).toBe("0");
  });
  it("sem colheitas → dados insuficientes", () => {
    const r = computeCycleIndicators(base({ harvests: [] }));
    expect(get(r, "PROD_MKT").status).toBe("insufficient_data");
    expect(get(r, "COST_PER_KG").status).toBe("insufficient_data");
  });
  it("área ausente → produtividade com dados insuficientes", () => {
    const r = computeCycleIndicators(base({ structure: { id: "s1", footprint_area_m2: null, cultivation_area_m2: null, useful_area_m2: null } }));
    expect(get(r, "YIELD_FOOTPRINT").status).toBe("insufficient_data");
  });
  it("sem medições de água → explica a ausência e não inventa valor", () => {
    const w = get(computeCycleIndicators(base()), "WATER_PER_KG");
    expect(w.status).toBe("insufficient_data");
    expect(w.notes.join(" ")).toMatch(/Sem medições de água/);
  });
});

describe("repartição, moedas, ativos e agregação", () => {
  it("custo partilhado repartido não é duplicado entre ciclos", () => {
    const e = new Map([["e1", exp("e1", "1000")]]);
    const c1 = computeCycleIndicators(base({ expenses: e, allocations: [{ id: "a1", expense_id: "e1", share: "0.6" }] }));
    const c2 = computeCycleIndicators(base({ cycle: { ...base().cycle, id: "c2" }, expenses: e, allocations: [{ id: "a2", expense_id: "e1", share: "0.4" }] }));
    expect(Number(get(c1, "OPCOST").value) + Number(get(c2, "OPCOST").value)).toBe(1000);
  });
  it("repartição parcial mostra a parte não atribuída", () => {
    const u = unallocated([exp("e1", "1000")], [{ id: "a1", expense_id: "e1", share: "0.25" }]);
    expect(u).toEqual([{ expenseId: "e1", currency: "AOA", allocatedShare: "0.25", unallocatedAmount: "750" }]);
  });
  it("moedas diferentes não são agregadas", () => {
    const r = computeCycleIndicators(
      base({
        expenses: new Map([
          ["e1", exp("e1", "50000")],
          ["e2", exp("e2", "20", { currency: "EUR" })],
        ]),
        allocations: [
          { id: "a1", expense_id: "e1", share: "1" },
          { id: "a2", expense_id: "e2", share: "1" },
        ],
      }),
    );
    expect(r.filter((x) => x.code === "OPCOST").map((x) => x.currency).sort()).toEqual(["AOA", "EUR"]);
    expect(get(r, "COST_PER_KG").status).toBe("mixed_currency");
  });
  it("estimativa substituída por fatura real não é contada duas vezes", () => {
    const r = computeCycleIndicators(
      base({
        expenses: new Map([
          ["est", exp("est", "40000", { replaced: true })],
          ["real", exp("real", "50000")],
        ]),
        allocations: [
          { id: "a1", expense_id: "est", share: "1" },
          { id: "a2", expense_id: "real", share: "1" },
        ],
      }),
    );
    expect(get(r, "OPCOST").value).toBe("50000");
  });
  it("investimento e depreciação ficam separados; aquisição não entra nos custos operacionais", () => {
    const r = computeCycleIndicators(
      base({
        cycle: { id: "c1", code: "C1", area_fraction: "0.5", start_date: "2026-01-01", end_date: "2026-01-30" },
        assets: [
          { id: "as1", cost: "120000", installation_cost: "0", residual_value: "0", useful_life_months: 60, depreciation_method: "linear", currency: "AOA", in_use_from: null },
        ],
      }),
    );
    expect(get(r, "OPCOST").value).toBe("50000");
    const d = get(r, "DEPRECIATION");
    // 120000/60 = 2000 por mês × (30/30,4375) meses × 0,5
    expect(Number(d.value)).toBeCloseTo(2000 * (30 / 30.4375) * 0.5, 6);
    expect(d.notes.join(" ")).toMatch(/não somar/);
  });
  it("fração de área do ciclo evita somar áreas partilhadas; área de cultivo não é multiplicada pelos níveis", () => {
    const r = computeCycleIndicators(base({ cycle: { ...base().cycle, area_fraction: "0.5" } }));
    expect(get(r, "YIELD_FOOTPRINT").value).toBe("20"); // 100 kg / (10 m² × 0,5)
    expect(get(r, "YIELD_CULTIVATION").denominator).toBe("15"); // 30 × 0,5 (sem × níveis)
  });
  it("múltiplas colheitas não duplicam área nem custos", () => {
    const r = computeCycleIndicators(
      base({
        harvests: [
          { id: "h1", harvest_date: "2026-02-01", gross_kg: "60", marketable_kg: "50", rejected_kg: "10" },
          { id: "h2", harvest_date: "2026-02-15", gross_kg: "55", marketable_kg: "50", rejected_kg: "5" },
        ],
      }),
    );
    expect(get(r, "PROD_MKT").value).toBe("100");
    expect(get(r, "YIELD_FOOTPRINT").denominator).toBe("10");
    expect(get(r, "COST_PER_KG").value).toBe("500");
  });
  it("agregado usa razão Σcustos/Σkg e não a média dos custos/kg", () => {
    const c1 = computeCycleIndicators(base()); // 50000 / 100 = 500
    const c2 = computeCycleIndicators(
      base({
        cycle: { ...base().cycle, id: "c2" },
        harvests: [{ id: "h9", harvest_date: "2026-02-01", gross_kg: null, marketable_kg: "400", rejected_kg: null }],
        expenses: new Map([["e9", exp("e9", "40000")]]),
        allocations: [{ id: "a9", expense_id: "e9", share: "1" }],
      }),
    ); // 40000 / 400 = 100
    const agg = aggregateIndicators([
      { cycleId: "c1", results: c1 },
      { cycleId: "c2", results: c2 },
    ]);
    expect(agg.find((x) => x.code === "COST_PER_KG_AGG")!.value).toBe("180"); // 90000/500 (a média simples seria 300)
  });
  it("receita realizada só com vendas; margem sobre receita", () => {
    expect(get(computeCycleIndicators(base()), "REVENUE").status).toBe("insufficient_data");
    const r = computeCycleIndicators(base({ sales: [{ id: "v1", amount: "80000", currency: "AOA", quantity: "100", commercial_unit: "kg", kg_equivalent: "100" }] }));
    expect(get(r, "OP_BALANCE").value).toBe("30000");
    expect(get(r, "OP_MARGIN").value).toBe("0.375");
  });
});

describe("equilíbrio", () => {
  it("margem de contribuição positiva", () => {
    const r = breakEven("10000", "1500", "500");
    expect(r[0]!.value).toBe("1000");
    expect(r[1]!.value).toBe("10");
  });
  it("margem não positiva → estado explicado, sem infinito", () => {
    const r = breakEven("10000", "500", "500");
    expect(r[1]!.status).toBe("non_positive");
    expect(r[1]!.value).toBeNull();
  });
});

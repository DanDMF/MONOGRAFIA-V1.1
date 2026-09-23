import type { Queryable } from "../../db/pool.js";
import { q } from "../../db/pool.js";
import {
  FORMULA_VERSION,
  aggregateIndicators,
  computeCycleIndicators,
  unallocated,
  type AllocationIn,
  type AssetIn,
  type ConsumptionIn,
  type CycleInput,
  type ExpenseIn,
  type HarvestIn,
  type IndicatorResult,
  type LaborIn,
  type SaleIn,
} from "./calc.js";

export interface CycleRow {
  id: string;
  code: string;
  crop_id: string;
  crop_name: string;
  crop_variety: string | null;
  structure_id: string;
  structure_code: string;
  area_fraction: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  footprint_area_m2: string | null;
  cultivation_area_m2: string | null;
  useful_area_m2: string | null;
}

export async function loadAnalysisData(db: Queryable, projectId: string, cycleIds?: string[]) {
  const cycles = await q<CycleRow>(
    db,
    `select c.id, c.code, c.crop_id, cr.name as crop_name, cr.variety as crop_variety, c.structure_id, s.code as structure_code,
            c.area_fraction, c.start_date, c.end_date, c.status, s.footprint_area_m2, s.cultivation_area_m2, s.useful_area_m2
       from cycle c join crop cr on cr.id = c.crop_id join structure s on s.id = c.structure_id
      where c.project_id = $1 and c.archived_at is null ${cycleIds ? "and c.id = any($2::uuid[])" : ""}
      order by c.code`,
    cycleIds ? [projectId, cycleIds] : [projectId],
  );
  const ids = cycles.map((c) => c.id);
  const harvests = await q<HarvestIn & { cycle_id: string }>(
    db,
    `select id, cycle_id, harvest_date, gross_kg, marketable_kg, rejected_kg from harvest
      where project_id = $1 and archived_at is null and cycle_id = any($2::uuid[]) order by harvest_date`,
    [projectId, ids],
  );
  const expensesRows = await q<ExpenseIn & { replaced: boolean }>(
    db,
    `select e.id, e.amount, e.currency, e.is_operational, e.cost_behavior, e.category,
            exists (select 1 from expense r where r.replaces_expense_id = e.id and r.archived_at is null) as replaced
       from expense e where e.project_id = $1 and e.archived_at is null`,
    [projectId],
  );
  const expenses = new Map(expensesRows.map((e) => [e.id, e]));
  const allocations = await q<AllocationIn & { cycle_id: string }>(
    db,
    "select a.id, a.expense_id, a.cycle_id, a.share from allocation a join expense e on e.id = a.expense_id where a.project_id = $1 and e.archived_at is null",
    [projectId],
  );
  const sales = await q<SaleIn & { cycle_id: string | null }>(
    db,
    "select id, cycle_id, amount, currency, quantity, commercial_unit, kg_equivalent from sale where project_id = $1 and archived_at is null",
    [projectId],
  );
  const consumptions = await q<ConsumptionIn & { cycle_id: string | null }>(
    db,
    "select id, cycle_id, resource, quantity, unit, power_w, hours_used from consumption where project_id = $1 and archived_at is null",
    [projectId],
  );
  const labor = await q<LaborIn & { cycle_id: string | null }>(
    db,
    "select id, cycle_id, hours, is_paid, hourly_rate, currency from labor_entry where project_id = $1 and archived_at is null",
    [projectId],
  );
  const assets = await q<AssetIn & { structure_id: string | null }>(
    db,
    `select id, structure_id, cost, installation_cost, residual_value, useful_life_months, depreciation_method, currency, in_use_from
       from asset where project_id = $1 and archived_at is null`,
    [projectId],
  );
  return { cycles, harvests, expenses, expensesRows, allocations, sales, consumptions, labor, assets };
}

export async function computeProjectIndicators(db: Queryable, projectId: string, cycleIds?: string[]) {
  const d = await loadAnalysisData(db, projectId, cycleIds);
  const perCycle = d.cycles.map((c) => {
    const input: CycleInput = {
      cycle: { id: c.id, code: c.code, area_fraction: c.area_fraction, start_date: c.start_date, end_date: c.end_date },
      structure: {
        id: c.structure_id,
        footprint_area_m2: c.footprint_area_m2,
        cultivation_area_m2: c.cultivation_area_m2,
        useful_area_m2: c.useful_area_m2,
      },
      harvests: d.harvests.filter((h) => h.cycle_id === c.id),
      expenses: d.expenses,
      allocations: d.allocations.filter((a) => a.cycle_id === c.id),
      sales: d.sales.filter((x) => x.cycle_id === c.id),
      consumptions: d.consumptions.filter((x) => x.cycle_id === c.id),
      labor: d.labor.filter((x) => x.cycle_id === c.id),
      assets: d.assets.filter((a) => a.structure_id === c.structure_id),
    };
    return { cycleId: c.id, cycle: c, results: computeCycleIndicators(input) };
  });
  return {
    formulaVersion: FORMULA_VERSION,
    computedAt: new Date().toISOString(),
    perCycle,
    aggregate: aggregateIndicators(perCycle),
    unallocated: unallocated(d.expensesRows, d.allocations),
    data: d,
  };
}

/** Versão publicável: sem IDs de registos privados, com fórmula, unidade, cobertura e notas. */
export async function buildIndicatorSnapshot(db: Queryable, projectId: string) {
  const r = await computeProjectIndicators(db, projectId);
  const strip = (x: IndicatorResult) => ({
    code: x.code,
    label: x.label,
    unit: x.unit,
    status: x.status,
    value: x.value,
    numerator: x.numerator ?? null,
    denominator: x.denominator ?? null,
    currency: x.currency ?? null,
    formula: x.formula,
    formulaVersion: x.formulaVersion,
    notes: x.notes,
    coverage: x.coverage ?? null,
    inputCount: x.inputs.length,
  });
  return {
    formulaVersion: r.formulaVersion,
    computedAt: r.computedAt,
    results: r.perCycle.map((c) => ({
      cycle: { code: c.cycle.code, crop: c.cycle.crop_name, variety: c.cycle.crop_variety, start_date: c.cycle.start_date, end_date: c.cycle.end_date },
      indicators: c.results.map(strip),
    })),
    aggregate: r.aggregate.map(strip),
  };
}

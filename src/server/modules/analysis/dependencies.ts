// Motor de dependências (secções 51 e 56): "Onde é utilizado?" e "O que muda se eu o corrigir?".
// Mapeia um registo para os ciclos, indicadores e publicações que dependem dele.
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import type { EntityName } from "../../../shared/entities.js";

const INDICATORS_BY_ENTITY: Partial<Record<EntityName, string[]>> = {
  harvest: ["PROD_MKT", "PROD_GROSS", "LOSS_WEIGHT", "YIELD_FOOTPRINT", "YIELD_CULTIVATION", "COST_PER_KG", "WATER_PER_KG", "ENERGY_PER_KG", "LABOR_PER_KG", "COST_PER_KG_AGG"],
  expense: ["OPCOST", "COST_PER_KG", "OP_BALANCE", "OP_MARGIN", "COST_PER_KG_AGG"],
  allocation: ["OPCOST", "COST_PER_KG", "OP_BALANCE", "OP_MARGIN", "COST_PER_KG_AGG"],
  sale: ["REVENUE", "OP_BALANCE", "OP_MARGIN"],
  consumption: ["WATER_PER_KG", "ENERGY_PER_KG"],
  labor_entry: ["LABOR_PER_KG"],
  asset: ["DEPRECIATION"],
  structure: ["YIELD_FOOTPRINT", "YIELD_CULTIVATION", "DEPRECIATION"],
  cycle: ["YIELD_FOOTPRINT", "YIELD_CULTIVATION", "DEPRECIATION"],
};

export async function dependentsOf(db: Queryable, projectId: string, entity: EntityName, id: string) {
  let cycles: { id: string; code: string }[] = [];
  switch (entity) {
    case "harvest":
    case "field_event":
    case "consumption":
    case "labor_entry":
    case "sale":
      cycles = await q(db, `select c.id, c.code from cycle c join ${entity === "labor_entry" ? "labor_entry" : entity} x on x.cycle_id = c.id where x.id = $1 and c.project_id = $2`, [id, projectId]);
      break;
    case "allocation":
      cycles = await q(db, "select c.id, c.code from cycle c join allocation a on a.cycle_id = c.id where a.id = $1 and c.project_id = $2", [id, projectId]);
      break;
    case "expense":
      cycles = await q(db, "select distinct c.id, c.code from cycle c join allocation a on a.cycle_id = c.id where a.expense_id = $1 and c.project_id = $2", [id, projectId]);
      break;
    case "structure":
      cycles = await q(db, "select id, code from cycle where structure_id = $1 and project_id = $2", [id, projectId]);
      break;
    case "asset":
      cycles = await q(db, "select c.id, c.code from cycle c join asset a on a.structure_id = c.structure_id where a.id = $1 and c.project_id = $2", [id, projectId]);
      break;
    case "cycle":
      cycles = await q(db, "select id, code from cycle where id = $1 and project_id = $2", [id, projectId]);
      break;
    case "crop":
      cycles = await q(db, "select id, code from cycle where crop_id = $1 and project_id = $2", [id, projectId]);
      break;
  }
  const indicators = INDICATORS_BY_ENTITY[entity] ?? [];
  // Publicações com indicadores anteriores à última alteração deste registo: podem estar desatualizadas.
  const rec = await one<{ updated_at: string }>(db, `select updated_at from ${entity} where id = $1 and project_id = $2`, [id, projectId]).catch(() => undefined);
  const publications = indicators.length
    ? await q<{ id: string; label: string; created_at: string }>(
        db,
        `select p.id, p.label, p.created_at from publication p
          where p.project_id = $1 and p.withdrawn_at is null
            and exists (select 1 from publication_item i where i.publication_id = p.id and i.item_type = 'indicators')`,
        [projectId],
      )
    : [];
  return {
    cycles,
    indicators,
    publications: publications.map((p) => ({
      ...p,
      possiblyOutdated: !!rec && new Date(rec.updated_at) > new Date(p.created_at),
      note: "Snapshot publicado não muda; publicar nova versão para refletir correções.",
    })),
  };
}

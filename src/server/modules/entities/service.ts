import { z } from "zod";
import { Decimal } from "decimal.js";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { ENTITIES, type EntityDef, type EntityName, type FieldDef } from "../../../shared/entities.js";
import { audit } from "../../lib/audit.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { decimalString, emptyToNull, isoDate, parse, uuid } from "../../lib/validate.js";

function fieldSchema(f: FieldDef): z.ZodType {
  let s: z.ZodType;
  switch (f.kind) {
    case "text":
      s = z.string().trim().min(1).max(500);
      break;
    case "longtext":
      s = z.string().max(50_000);
      break;
    case "int": {
      let n = z.coerce.number().int();
      if (f.min !== undefined) n = n.min(f.min);
      if (f.max !== undefined) n = n.max(f.max);
      s = n;
      break;
    }
    case "decimal":
      s = decimalString.refine(
        (v) => (f.min === undefined || new Decimal(v).gte(f.min)) && (f.max === undefined || new Decimal(v).lte(f.max)),
        { message: `Fora do intervalo${f.min !== undefined ? ` ≥ ${f.min}` : ""}${f.max !== undefined ? ` ≤ ${f.max}` : ""}` },
      );
      break;
    case "date":
      s = isoDate;
      break;
    case "bool":
      s = z.boolean();
      break;
    case "ref":
      s = uuid;
      break;
    case "enum":
      s = z.enum(Object.keys(f.values ?? {}) as [string, ...string[]]);
      break;
  }
  return z.preprocess(emptyToNull, f.required ? s : s.nullable());
}

export function entitySchema(def: EntityDef, mode: "create" | "update") {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, f] of Object.entries(def.fields)) {
    let s = fieldSchema(f);
    if (name.endsWith("currency")) s = z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() : v), s);
    if (mode === "update" || (!f.required) || f.default !== undefined) s = s.optional();
    shape[name] = s;
  }
  if (mode === "update") shape.version = z.coerce.number().int().min(1);
  return z.object(shape).strict();
}

const REF_TABLE = (f: FieldDef) => (f.ref === "reference" ? "reference" : f.ref ? ENTITIES[f.ref].table : null);

/** Garante que chaves estrangeiras pertencem ao mesmo projeto (isolamento entre projetos). */
async function checkRefs(db: Queryable, def: EntityDef, projectId: string, data: Record<string, unknown>) {
  for (const [name, f] of Object.entries(def.fields)) {
    const v = data[name];
    if (f.kind !== "ref" || v == null) continue;
    const table = REF_TABLE(f)!;
    const row = await one(db, `select 1 from ${table} where id = $1 and project_id = $2`, [v, projectId]);
    if (!row) throw badRequest(`${f.label}: registo inexistente neste projeto.`);
  }
}

function withDefaults(def: EntityDef, data: Record<string, unknown>) {
  const out = { ...data };
  for (const [name, f] of Object.entries(def.fields)) {
    if (out[name] === undefined && f.default !== undefined) out[name] = f.default;
  }
  return out;
}

export interface ListOptions {
  filters?: Record<string, string>;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export async function listEntities(db: Queryable, name: EntityName, projectId: string, opt: ListOptions = {}) {
  const def = ENTITIES[name];
  const where = ["project_id = $1"];
  const params: unknown[] = [projectId];
  for (const [k, v] of Object.entries(opt.filters ?? {})) {
    const f = def.fields[k];
    if (!f || !(f.kind === "ref" || f.kind === "enum" || f.kind === "bool")) continue; // apenas filtros seguros
    params.push(f.kind === "bool" ? v === "true" : v);
    where.push(`${k} = $${params.length}`);
  }
  if (!opt.includeArchived && "archived_at" in (await columnsOf(db, def.table))) where.push("archived_at is null");
  const limit = Math.min(opt.limit ?? 1000, 5000);
  params.push(limit, opt.offset ?? 0);
  const rows = await q(
    db,
    `select * from ${def.table} where ${where.join(" and ")} order by ${def.orderBy}, created_at, id
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  const total = await one<{ n: string }>(
    db,
    `select count(*) as n from ${def.table} where ${where.join(" and ")}`,
    params.slice(0, -2),
  );
  return { rows, total: Number(total?.n ?? 0) };
}

const columnCache = new Map<string, Record<string, true>>();
async function columnsOf(db: Queryable, table: string) {
  let c = columnCache.get(table);
  if (!c) {
    const rows = await q<{ column_name: string }>(
      db,
      "select column_name from information_schema.columns where table_name = $1 and table_schema = current_schema()",
      [table],
    );
    c = Object.fromEntries(rows.map((r) => [r.column_name, true as const]));
    columnCache.set(table, c);
  }
  return c;
}

export async function getEntity(db: Queryable, name: EntityName, projectId: string, id: string) {
  const def = ENTITIES[name];
  parse(uuid, id);
  const row = await one(db, `select * from ${def.table} where id = $1 and project_id = $2`, [id, projectId]);
  if (!row) throw notFound(def.label);
  return row;
}

export async function createEntity(db: Queryable, name: EntityName, projectId: string, userId: string, body: unknown) {
  const def = ENTITIES[name];
  const data = withDefaults(def, parse(entitySchema(def, "create"), body) as Record<string, unknown>);
  await checkRefs(db, def, projectId, data);
  await domainChecks(db, name, projectId, data, null);
  const cols = Object.keys(data).filter((k) => data[k] !== undefined);
  const cr = await columnsOf(db, def.table);
  const extra: Record<string, unknown> = { project_id: projectId };
  if (cr.created_by) extra.created_by = userId;
  const all = [...Object.keys(extra), ...cols];
  const values = [...Object.values(extra), ...cols.map((c) => data[c])];
  const row = await one<Record<string, unknown>>(
    db,
    `insert into ${def.table} (${all.join(", ")}) values (${all.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    values,
  );
  await audit(db, { projectId, userId, action: "create", entityType: name, entityId: String(row!.id), after: row });
  return row!;
}

export async function updateEntity(db: Queryable, name: EntityName, projectId: string, userId: string, id: string, body: unknown) {
  const def = ENTITIES[name];
  if (def.immutable) throw badRequest(`${def.labelPlural} são imutáveis: crie uma nova versão em vez de alterar a anterior.`);
  const before = await getEntity(db, name, projectId, id);
  const { version, ...data } = parse(entitySchema(def, "update"), body) as Record<string, unknown> & { version: number };
  await checkRefs(db, def, projectId, data);
  await domainChecks(db, name, projectId, { ...before, ...data }, id);
  const cols = Object.keys(data).filter((k) => data[k] !== undefined);
  if (cols.length === 0) return before;
  const sets = cols.map((c, i) => `${c} = $${i + 4}`);
  const row = await one<Record<string, unknown>>(
    db,
    `update ${def.table} set ${sets.join(", ")}, version = version + 1, updated_at = now()
      where id = $1 and project_id = $2 and version = $3 returning *`,
    [id, projectId, version, ...cols.map((c) => data[c])],
  );
  if (!row) {
    throw conflict("O registo foi alterado noutra sessão. Recarregue e reaplique as alterações.", { current: before });
  }
  await audit(db, { projectId, userId, action: "update", entityType: name, entityId: id, before, after: row });
  return row;
}

export async function setArchived(db: Queryable, name: EntityName, projectId: string, userId: string, id: string, archived: boolean) {
  const def = ENTITIES[name];
  const cols = await columnsOf(db, def.table);
  if (!cols.archived_at) throw badRequest(`${def.labelPlural} não podem ser arquivados; remova a repartição.`);
  const row = await one(
    db,
    `update ${def.table} set archived_at = ${archived ? "now()" : "null"}${cols.version ? ", version = version + 1" : ""}
      where id = $1 and project_id = $2 returning *`,
    [id, projectId],
  );
  if (!row) throw notFound(def.label);
  await audit(db, { projectId, userId, action: archived ? "archive" : "restore", entityType: name, entityId: id });
  return row;
}

export async function deleteAllocation(db: Queryable, projectId: string, userId: string, id: string) {
  const before = await getEntity(db, "allocation", projectId, id);
  await q(db, "delete from allocation where id = $1 and project_id = $2", [id, projectId]);
  await audit(db, { projectId, userId, action: "delete", entityType: "allocation", entityId: id, before });
}

export async function history(db: Queryable, projectId: string, entityType: string, id: string) {
  return q(
    db,
    `select a.id, a.action, a.summary, a.before, a.after, a.created_at, u.display_name as user_name
       from audit_event a left join app_user u on u.id = a.user_id
      where a.project_id = $1 and a.entity_type = $2 and a.entity_id = $3 order by a.created_at desc, a.id desc`,
    [projectId, entityType, id],
  );
}

/** Regras de domínio adicionais por entidade. */
async function domainChecks(db: Queryable, name: EntityName, projectId: string, d: Record<string, unknown>, id: string | null) {
  if (name === "harvest") {
    const g = d.gross_kg != null ? new Decimal(d.gross_kg as string) : null;
    const m = d.marketable_kg != null ? new Decimal(d.marketable_kg as string) : null;
    const r = d.rejected_kg != null ? new Decimal(d.rejected_kg as string) : null;
    if (g && m && m.gt(g)) throw badRequest("Peso comercializável não pode exceder o peso bruto.");
    if (g && r && r.gt(g)) throw badRequest("Peso rejeitado não pode exceder o peso bruto.");
  }
  if (name === "cycle" && d.start_date && d.end_date && String(d.end_date) < String(d.start_date)) {
    throw badRequest("A data de fim é anterior à data de início.");
  }
  if (name === "consumption" && d.reading_start != null && d.reading_end != null) {
    if (new Decimal(d.reading_end as string).lt(d.reading_start as string)) throw badRequest("Leitura final inferior à inicial.");
  }
  if (name === "sale" && d.kg_equivalent != null && !d.kg_equivalent_origin) {
    throw badRequest("Indique a origem do peso equivalente (medição ou pressuposto identificado).");
  }
  if (name === "expense" && d.replaces_expense_id && d.replaces_expense_id === id) {
    throw badRequest("Uma despesa não se pode substituir a si própria.");
  }
  if (name === "allocation") {
    const rows = await q<{ total: string | null }>(
      db,
      "select sum(share) as total from allocation where expense_id = $1 and ($2::uuid is null or id <> $2)",
      [d.expense_id, id],
    );
    const other = new Decimal(rows[0]?.total ?? 0);
    if (other.plus(d.share as string).gt(1)) {
      throw conflict(
        `A soma das repartições desta despesa excederia 100% (já atribuído: ${other.times(100).toFixed(2)}%).`,
      );
    }
  }
  void projectId;
}

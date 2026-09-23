// Exportação Excel verdadeira (.xlsx, exceljs). Contrato em docs/EXPORTS.md.
// - números como números, datas como datas, IDs como texto, ausência = célula vazia (nunca zero);
// - texto do utilizador escrito sempre como texto (nunca interpretado como fórmula);
// - fórmulas de reprodução reais do Excel, sem referências ao servidor; resultado do sistema em coluna própria;
// - recálculo completo ao abrir (fullCalcOnLoad).
import ExcelJS from "exceljs";
import { z } from "zod";
import type { Queryable } from "../../db/pool.js";
import { one, q } from "../../db/pool.js";
import { ENTITIES, type EntityName, type FieldDef } from "../../../shared/entities.js";
import { computeProjectIndicators } from "../analysis/indicators-service.js";
import { FORMULA_VERSION, type IndicatorResult } from "../analysis/calc.js";
import { parse, uuid } from "../../lib/validate.js";
import { renderProjectCitations } from "../content/render.js";
import { listReferences } from "../bibliography/references.js";

export const EXCEL_SHEETS = [
  "LEIA_ME", "Metadados", "Dicionario", "Locais", "Estruturas", "Culturas", "Ciclos", "Registos_Campo", "Colheitas",
  "Consumos", "Trabalho", "Ativos", "Despesas", "Reparticoes", "Vendas", "Taxas_Cambio", "Indicadores", "Formulas",
  "Referencias",
] as const;

export const excelExportSchema = z.object({
  cycleIds: z.array(uuid).optional(), // ausente = toda a investigação autorizada
  sheets: z.array(z.enum(EXCEL_SHEETS)).optional(),
  mode: z.enum(["values", "formulas", "both"]).default("both"),
  includePrivate: z.boolean().default(false),
  template: z.boolean().default(false), // modelo vazio para recolha offline
});
export type ExcelExportOptions = z.infer<typeof excelExportSchema>;

const SHEET_ENTITY: Partial<Record<(typeof EXCEL_SHEETS)[number], EntityName>> = {
  Locais: "location",
  Estruturas: "structure",
  Culturas: "crop",
  Ciclos: "cycle",
  Registos_Campo: "field_event",
  Colheitas: "harvest",
  Consumos: "consumption",
  Trabalho: "labor_entry",
  Ativos: "asset",
  Despesas: "expense",
  Reparticoes: "allocation",
  Vendas: "sale",
  Taxas_Cambio: "exchange_rate",
};

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7EFE9" } };

export interface ExcelSummary {
  sheets: { name: string; rows: number }[];
  formulaVersion: string;
  scope: string;
  includePrivate: boolean;
  mode: string;
}

/** Converte "AAAA-MM-DD" para Date UTC (data civil, sem deslocamento de fuso). */
const civilDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};

function cellValue(f: FieldDef | { kind: string }, v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return null;
  switch (f.kind) {
    case "decimal":
      return Number(v);
    case "int":
      return Number(v);
    case "date":
      return typeof v === "string" ? civilDate(v) : (v as Date);
    case "bool":
      return Boolean(v);
    default:
      return String(v); // exceljs grava strings como texto (sem avaliação de fórmulas)
  }
}

function header(f: FieldDef) {
  return f.unit ? `${f.label} (${f.unit})` : f.label;
}

function styleSheet(ws: ExcelJS.Worksheet, widths: number[]) {
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
  ws.columns.forEach((c, i) => (c.width = Math.max(10, Math.min(60, widths[i] ?? 14))));
  if (ws.rowCount >= 1 && ws.columnCount >= 1) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
}

const colLetter = (n: number) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

interface EntitySheetInfo {
  name: string;
  columns: string[]; // códigos de campo na ordem das colunas
  rowCount: number;
}

export async function buildResearchWorkbook(db: Queryable, projectId: string, rawOptions: unknown) {
  const opt = parse(excelExportSchema, rawOptions ?? {});
  const project = await one<Record<string, string | null>>(db, "select * from project where id = $1", [projectId]);
  if (!project) throw new Error("Projeto inexistente");
  const wanted = new Set(opt.sheets ?? EXCEL_SHEETS);
  const wb = new ExcelJS.Workbook();
  wb.creator = "VRBAN — Centro Integrado de Investigação";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };

  const analysis = opt.template ? null : await computeProjectIndicators(db, projectId, opt.cycleIds);
  const cycleSet = analysis ? new Set(analysis.data.cycles.map((c) => c.id)) : new Set<string>();
  const scoped = !!opt.cycleIds;

  // ---- dados por entidade, respeitando o escopo de ciclos
  const rowsFor = async (name: EntityName): Promise<Record<string, unknown>[]> => {
    if (opt.template) return [];
    const def = ENTITIES[name];
    const rows = await q<Record<string, unknown>>(
      db,
      `select * from ${def.table} where project_id = $1 order by ${def.orderBy}, id`,
      [projectId],
    );
    const active = rows.filter((r) => !("archived_at" in r) || r.archived_at === null);
    if (!scoped) return active;
    const d = analysis!.data;
    const structures = new Set(d.cycles.map((c) => c.structure_id));
    const crops = new Set(d.cycles.map((c) => c.crop_id));
    const allocs = d.allocations.filter((a) => cycleSet.has(a.cycle_id));
    const expenseIds = new Set(allocs.map((a) => a.expense_id));
    switch (name) {
      case "cycle":
        return active.filter((r) => cycleSet.has(String(r.id)));
      case "harvest":
      case "field_event":
        return active.filter((r) => cycleSet.has(String(r.cycle_id)));
      case "consumption":
      case "labor_entry":
      case "sale":
        return active.filter((r) => r.cycle_id && cycleSet.has(String(r.cycle_id)));
      case "allocation":
        return active.filter((r) => cycleSet.has(String(r.cycle_id)));
      case "expense":
        return active.filter((r) => expenseIds.has(String(r.id)));
      case "structure":
        return active.filter((r) => structures.has(String(r.id)));
      case "crop":
        return active.filter((r) => crops.has(String(r.id)));
      case "location": {
        const locs = new Set(
          (await q<{ location_id: string }>(db, "select location_id from structure where id = any($1::uuid[])", [[...structures]])).map((x) => x.location_id),
        );
        return active.filter((r) => locs.has(String(r.id)));
      }
      case "asset":
        return active.filter((r) => r.structure_id && structures.has(String(r.structure_id)));
      default:
        return active;
    }
  };

  const summary: ExcelSummary = {
    sheets: [],
    formulaVersion: FORMULA_VERSION,
    scope: opt.template ? "Modelo vazio para recolha offline" : scoped ? `${cycleSet.size} ciclo(s) selecionado(s)` : "Toda a investigação autorizada",
    includePrivate: opt.includePrivate,
    mode: opt.mode,
  };

  // ---- LEIA_ME e Metadados primeiro (ordem das folhas)
  const readme = wanted.has("LEIA_ME") ? wb.addWorksheet("LEIA_ME") : null;
  const meta = wanted.has("Metadados") ? wb.addWorksheet("Metadados") : null;
  const dict = wanted.has("Dicionario") ? wb.addWorksheet("Dicionario") : null;

  const entityInfo = new Map<string, EntitySheetInfo>();
  for (const sheetName of EXCEL_SHEETS) {
    const entity = SHEET_ENTITY[sheetName];
    if (!entity || !wanted.has(sheetName)) continue;
    const def = ENTITIES[entity];
    const fields = Object.entries(def.fields).filter(([, f]) => opt.includePrivate || !f.private);
    const ws = wb.addWorksheet(sheetName);
    const extra: { key: string; label: string; kind: string }[] = [];
    if (entity === "allocation") {
      extra.push({ key: "__expense_amount", label: "Valor da despesa", kind: "decimal" });
      extra.push({ key: "__currency", label: "Moeda da despesa", kind: "text" });
      extra.push({ key: "__is_operational", label: "Despesa operacional", kind: "bool" });
      extra.push({ key: "__replaced", label: "Estimativa substituída", kind: "bool" });
      extra.push({ key: "__allocated", label: "Valor atribuído (fórmula)", kind: "formula" });
    }
    const columns = ["id", ...fields.map(([k]) => k), ...extra.map((e) => e.key), "version", "updated_at"];
    ws.addRow(["ID", ...fields.map(([, f]) => header(f)), ...extra.map((e) => e.label), "Versão do registo", "Última alteração (UTC)"]);
    const rows = await rowsFor(entity);
    const expenses = entity === "allocation" ? analysis?.data.expenses : undefined;
    const shareCol = columns.indexOf("share") + 1;
    const amountCol = columns.indexOf("__expense_amount") + 1;
    for (const r of rows) {
      const values: ExcelJS.CellValue[] = [String(r.id)];
      for (const [k, f] of fields) values.push(cellValue(f, r[k]));
      for (const e of extra) {
        const exp = expenses?.get(String(r.expense_id));
        if (e.key === "__expense_amount") values.push(exp ? Number(exp.amount) : null);
        if (e.key === "__currency") values.push(exp?.currency ?? null);
        if (e.key === "__is_operational") values.push(exp ? exp.is_operational : null);
        if (e.key === "__replaced") values.push(exp ? exp.replaced : null);
        if (e.key === "__allocated") values.push(null); // fórmula abaixo
      }
      values.push(Number(r.version ?? 1));
      values.push(r.updated_at ? new Date(String(r.updated_at)) : null);
      const row = ws.addRow(values);
      if (entity === "allocation") {
        const idx = row.number;
        const exp = expenses?.get(String(r.expense_id));
        const allocated = exp ? Number(exp.amount) * Number(r.share) : undefined;
        row.getCell(columns.indexOf("__allocated") + 1).value = {
          formula: `${colLetter(shareCol)}${idx}*${colLetter(amountCol)}${idx}`,
          result: allocated,
        };
      }
    }
    // formatos
    columns.forEach((c, i) => {
      const f = def.fields[c];
      const col = ws.getColumn(i + 1);
      if (f?.kind === "date") col.numFmt = "yyyy-mm-dd";
      if (f?.kind === "decimal" && (c === "share" || c === "area_fraction")) col.numFmt = "0.00%";
      if (c === "updated_at") col.numFmt = "yyyy-mm-dd hh:mm";
      if (c === "__expense_amount" || c === "__allocated") col.numFmt = "#,##0.00";
    });
    styleSheet(ws, columns.map((c) => (c === "id" || c.endsWith("_id") ? 38 : c === "description" || c === "notes" ? 40 : 16)));
    entityInfo.set(sheetName, { name: sheetName, columns, rowCount: rows.length });
    summary.sheets.push({ name: sheetName, rows: rows.length });
  }

  // ---- Indicadores (valor do sistema + fórmula de reprodução)
  if (wanted.has("Indicadores") && analysis) {
    const ws = wb.addWorksheet("Indicadores");
    const withFormula = opt.mode !== "values";
    const withValue = opt.mode !== "formulas";
    const head = ["ID ciclo", "Código do ciclo", "Cultura", "Indicador (código)", "Indicador", "Unidade", "Moeda", "Estado"];
    if (withValue) head.push("Valor calculado pelo sistema");
    if (withFormula) head.push("Valor reproduzido no Excel (fórmula)");
    if (withValue && withFormula) head.push("Diferença (sistema − Excel)");
    head.push("Numerador", "Denominador", "Fórmula (definição)", "Versão do cálculo", "Cobertura", "Notas");
    ws.addRow(head);
    const H = (name: string) => head.indexOf(name) + 1;
    const cyc = entityInfo.get("Ciclos");
    const har = entityInfo.get("Colheitas");
    const rep = entityInfo.get("Reparticoes");
    const est = entityInfo.get("Estruturas");
    const col = (info: EntitySheetInfo | undefined, key: string) => {
      if (!info) return null;
      const i = info.columns.indexOf(key);
      return i < 0 ? null : `${info.name}!$${colLetter(i + 1)}:$${colLetter(i + 1)}`;
    };
    const rowRef = new Map<string, number>(); // `${cycleId}|${code}|${currency}` → linha
    const pending: { row: ExcelJS.Row; r: IndicatorResult; cycleId: string; structureId: string }[] = [];
    for (const c of analysis.perCycle) {
      for (const r of c.results) {
        const values: ExcelJS.CellValue[] = [c.cycle.id, c.cycle.code, c.cycle.crop_name, r.code, r.label, r.unit, r.currency ?? null, r.status];
        if (withValue) values.push(r.value !== null ? Number(r.value) : null);
        if (withFormula) values.push(null);
        if (withValue && withFormula) values.push(null);
        values.push(
          r.numerator != null ? Number(r.numerator) : null,
          r.denominator != null ? Number(r.denominator) : null,
          r.formula,
          r.formulaVersion,
          r.coverage ? `${r.coverage.used}/${r.coverage.total}` : null,
          r.notes.join(" ") || null,
        );
        const row = ws.addRow(values);
        rowRef.set(`${c.cycle.id}|${r.code}|${r.currency ?? ""}`, row.number);
        pending.push({ row, r, cycleId: c.cycle.id, structureId: c.cycle.structure_id });
      }
    }
    if (withFormula) {
      const fcol = H("Valor reproduzido no Excel (fórmula)");
      const vcol = H("Valor calculado pelo sistema");
      const idCell = (n: number) => `$A${n}`;
      for (const p of pending) {
        const n = p.row.number;
        let formula: string | null = null;
        const harMkt = col(har, "marketable_kg");
        const harGross = col(har, "gross_kg");
        const harRej = col(har, "rejected_kg");
        const harCyc = col(har, "cycle_id");
        const repCyc = col(rep, "cycle_id");
        const repAlloc = col(rep, "__allocated");
        const repCur = col(rep, "__currency");
        const repOp = col(rep, "__is_operational");
        const repRepl = col(rep, "__replaced");
        const cycId = col(cyc, "id");
        const cycFrac = col(cyc, "area_fraction");
        const cycStruct = col(cyc, "structure_id");
        const estId = col(est, "id");
        const estFoot = col(est, "footprint_area_m2");
        const estCult = col(est, "cultivation_area_m2");
        const prodRow = rowRef.get(`${p.cycleId}|PROD_MKT|`);
        const prodCell = prodRow ? `${colLetter(fcol)}${prodRow}` : null;
        const area = (areaCol: string | null) =>
          areaCol && estId && cycStruct && cycId && cycFrac
            ? `(INDEX(${areaCol},MATCH(INDEX(${cycStruct},MATCH(${idCell(n)},${cycId},0)),${estId},0))*INDEX(${cycFrac},MATCH(${idCell(n)},${cycId},0)))`
            : null;
        switch (p.r.code) {
          case "PROD_MKT":
            if (harMkt && harCyc) formula = `SUMIFS(${harMkt},${harCyc},${idCell(n)})`;
            break;
          case "PROD_GROSS":
            if (harGross && harCyc) formula = `SUMIFS(${harGross},${harCyc},${idCell(n)})`;
            break;
          case "LOSS_WEIGHT":
            if (harGross && harRej && harCyc)
              formula = `SUMIFS(${harRej},${harCyc},${idCell(n)},${harGross},"<>",${harRej},"<>")/SUMIFS(${harGross},${harCyc},${idCell(n)},${harGross},"<>",${harRej},"<>")`;
            break;
          case "OPCOST":
            if (repAlloc && repCyc && repCur && repOp && repRepl && p.r.currency)
              formula = `SUMIFS(${repAlloc},${repCyc},${idCell(n)},${repCur},"${p.r.currency}",${repOp},TRUE,${repRepl},FALSE)`;
            break;
          case "COST_PER_KG": {
            const oc = rowRef.get(`${p.cycleId}|OPCOST|${p.r.currency ?? ""}`);
            if (oc && prodCell) formula = `${colLetter(fcol)}${oc}/${prodCell}`;
            break;
          }
          case "YIELD_FOOTPRINT": {
            const a = area(estFoot);
            if (a && prodCell) formula = `${prodCell}/${a}`;
            break;
          }
          case "YIELD_CULTIVATION": {
            const a = area(estCult);
            if (a && prodCell) formula = `${prodCell}/${a}`;
            break;
          }
        }
        if (formula && p.r.value !== null) {
          p.row.getCell(fcol).value = { formula, result: Number(p.r.value) };
          if (withValue) {
            p.row.getCell(H("Diferença (sistema − Excel)")).value = {
              formula: `${colLetter(vcol)}${n}-${colLetter(fcol)}${n}`,
              result: 0,
            };
          }
        }
      }
    }
    styleSheet(ws, head.map((h) => (h.startsWith("ID") ? 38 : h.startsWith("Fórmula") || h === "Notas" ? 50 : 18)));
    summary.sheets.push({ name: "Indicadores", rows: pending.length });
  }

  if (wanted.has("Formulas")) {
    const ws = wb.addWorksheet("Formulas");
    ws.addRow(["Código", "Indicador", "Fórmula matemática", "Unidade", "Pressupostos e limites", "Versão"]);
    const catalog: [string, string, string, string, string][] = [
      ["PROD_MKT", "Produção comercializável", "Σ peso comercializável das colheitas do ciclo", "kg", "Colheitas sem peso comercializável não contam como zero (estado 'partial')."],
      ["PROD_GROSS", "Produção bruta", "Σ peso bruto", "kg", ""],
      ["LOSS_WEIGHT", "Perda de peso na colheita", "Σ rejeitado / Σ bruto (colheitas com ambos)", "fração", "Não inclui perda de plantas."],
      ["YIELD_FOOTPRINT", "Produtividade por implantação", "kg comercializáveis / (área de implantação × fração do ciclo)", "kg/m²/ciclo", "Não anualizado."],
      ["YIELD_CULTIVATION", "Produtividade por cultivo", "kg comercializáveis / (área de cultivo × fração do ciclo)", "kg/m²/ciclo", "Área de cultivo já agrega os níveis."],
      ["OPCOST", "Custos operacionais atribuídos", "Σ (valor da despesa × fração atribuída)", "moeda", "Exclui estimativas substituídas por documento real; moedas separadas."],
      ["COST_PER_KG", "Custo operacional por kg", "OPCOST / PROD_MKT", "moeda/kg", "Indefinido com denominador zero ou moedas mistas."],
      ["DEPRECIATION", "Depreciação linear", "((custo + instalação − residual) / vida útil) × meses do ciclo × fração", "moeda", "Visão económica; não somar à aquisição."],
      ["REVENUE", "Receita realizada", "Σ vendas efetivas", "moeda", "Colheita não gera receita."],
      ["OP_BALANCE", "Saldo operacional", "Receita − OPCOST", "moeda", ""],
      ["OP_MARGIN", "Margem operacional sobre receita", "Saldo / receita (receita > 0)", "fração", "Não é retorno sobre custo."],
      ["WATER_PER_KG", "Água por kg", "Σ litros / PROD_MKT", "L/kg", "m³ × 1000."],
      ["ENERGY_PER_KG", "Energia por kg", "Σ kWh / PROD_MKT", "kWh/kg", "Wh/1000; estimativa potência × horas identificada."],
      ["LABOR_PER_KG", "Trabalho por kg", "Σ horas / PROD_MKT", "h/kg", ""],
      ["COST_PER_KG_AGG", "Custo/kg agregado", "Σ custos / Σ kg (razão agregada)", "moeda/kg", "Nunca média simples dos custos/kg."],
    ];
    for (const c of catalog) ws.addRow([...c, FORMULA_VERSION]);
    styleSheet(ws, [18, 32, 60, 14, 60, 12]);
    summary.sheets.push({ name: "Formulas", rows: catalog.length });
  }

  if (wanted.has("Referencias") && !opt.template) {
    const ws = wb.addWorksheet("Referencias");
    ws.addRow(["ID", "Tipo", "Autores", "Ano", "Título", "Fonte/contentor", "DOI", "URL", "Referência APA formatada", "Citada no texto", "Verificação"]);
    const refs = await listReferences(db, projectId);
    const rendered = await renderProjectCitations(db, projectId);
    const fmt = new Map(rendered.bibliography.map((b) => [b.id, b.text]));
    for (const r of refs) {
      const authors = r.contributors
        .filter((c) => c.role === "author")
        .map((c) => c.literal ?? [c.particle, c.family].filter(Boolean).join(" ") + (c.given ? `, ${c.given}` : ""))
        .join("; ");
      ws.addRow([
        r.id,
        r.type,
        authors || null,
        r.issued_year != null ? Number(r.issued_year) : null,
        r.title,
        (r.container_title as string) ?? null,
        (r.doi as string) ?? null,
        (r.url as string) ?? null,
        fmt.get(r.id) ?? null,
        fmt.has(r.id),
        String(r.verification_status),
      ]);
    }
    styleSheet(ws, [38, 12, 40, 8, 50, 30, 24, 30, 80, 10, 16]);
    summary.sheets.push({ name: "Referencias", rows: refs.length });
  }

  // ---- Dicionário
  if (dict) {
    dict.addRow(["Folha", "Coluna", "Código do campo", "Tipo", "Unidade", "Definição", "Valores permitidos", "Privado", "Ausência"]);
    for (const [sheet, info] of entityInfo) {
      const def = ENTITIES[SHEET_ENTITY[sheet as keyof typeof SHEET_ENTITY]!];
      for (const c of info.columns) {
        const f = def.fields[c];
        if (f) {
          dict.addRow([
            sheet,
            header(f),
            c,
            f.kind,
            f.unit ?? null,
            f.description ?? null,
            f.values ? Object.entries(f.values).map(([k, v]) => `${k}=${v}`).join("; ") : null,
            !!f.private,
            "Célula vazia = valor não registado (não é zero).",
          ]);
        } else {
          dict.addRow([sheet, c, c, "sistema", null, "Campo técnico do sistema (ID estável, versão, data de alteração).", null, false, null]);
        }
      }
    }
    styleSheet(dict, [16, 34, 24, 10, 10, 60, 50, 8, 34]);
  }

  // ---- Metadados
  const exportedAt = new Date();
  if (meta) {
    meta.addRow(["Campo", "Valor"]);
    const rows: [string, ExcelJS.CellValue][] = [
      ["Projeto", project.name],
      ["Título académico", project.academic_title],
      ["Autor", project.author_name],
      ["Data de exportação (UTC)", exportedAt],
      ["Fuso horário do projeto", project.timezone],
      ["Moeda de apresentação", "Moeda original de cada registo (sem conversão)"],
      ["Escopo", summary.scope],
      ["Ciclos incluídos", analysis ? analysis.data.cycles.map((c) => c.code).join(", ") || "(nenhum)" : "(modelo vazio)"],
      ["Dados privados incluídos", opt.includePrivate ? "Sim" : "Não"],
      ["Modo", { values: "Valores para análise", formulas: "Resultados com fórmulas", both: "Ambos" }[opt.mode]],
      ["Versão do cálculo", FORMULA_VERSION],
      ["Perfil de citação", project.citation_locale],
      ["Estado do projeto", project.is_demo ? "DEMONSTRAÇÃO — dados fictícios" : "Projeto real"],
    ];
    for (const r of rows) meta.addRow(r);
    meta.getColumn(2).numFmt = "yyyy-mm-dd hh:mm";
    styleSheet(meta, [30, 70]);
  }

  // ---- LEIA_ME
  if (readme) {
    readme.addRow(["VRBAN — Exportação de dados de investigação"]);
    const lines = [
      `Projeto: ${project.name ?? ""}${project.academic_title ? " — " + project.academic_title : ""}`,
      `Autor: ${project.author_name ?? "(por preencher)"}`,
      `Exportado em: ${exportedAt.toISOString()} · Versão do cálculo: ${FORMULA_VERSION}`,
      `Escopo: ${summary.scope}. Dados privados: ${opt.includePrivate ? "incluídos" : "excluídos"}.`,
      project.is_demo ? "ATENÇÃO: projeto de demonstração com dados fictícios — não usar como resultados." : "",
      "",
      "Como usar:",
      "• Cada folha de dados tem uma linha por observação e uma coluna 'ID' estável; as relações entre folhas usam esses IDs.",
      "• Células vazias significam 'não registado' e nunca zero.",
      "• Valores monetários estão na moeda original de cada registo (coluna 'Moeda'); não são somadas moedas diferentes.",
      "• Folha 'Indicadores': 'Valor calculado pelo sistema' é o resultado do servidor; 'Valor reproduzido no Excel' é uma fórmula real",
      "  que recalcula a partir das folhas deste ficheiro; 'Diferença' deve ser 0 (tolerância documentada: 1e-9 relativa).",
      "• A folha 'Dicionario' descreve cada coluna, unidade e valores permitidos; 'Formulas' descreve cada indicador.",
      "• O Excel recalcula as fórmulas ao abrir. Se alterar dados aqui, a aplicação não é atualizada automaticamente.",
      "",
      "Limites: os indicadores descrevem o período e os ciclos exportados; não são anualizados nem extrapolados.",
    ];
    for (const l of lines) readme.addRow([l]);
    readme.getRow(1).font = { bold: true, size: 14 };
    readme.getColumn(1).width = 130;
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, summary, fileName: `VRBAN_${project.slug}_${exportedAt.toISOString().slice(0, 10)}${opt.template ? "_modelo" : ""}.xlsx` };
}

// ---------------- CSV com proteção contra injeção de fórmulas ----------------

/** Protege células de texto que começam por = + - @ tab ou CR (prefixo apóstrofo), e escapa aspas. */
export function csvCell(v: unknown, sep = ";"): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r") || s.startsWith("'")) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][], opts: { sep?: string; bom?: boolean } = {}): string {
  const sep = opts.sep ?? ";";
  const body = [headers, ...rows].map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join("\r\n");
  return (opts.bom ? "﻿" : "") + body + "\r\n";
}

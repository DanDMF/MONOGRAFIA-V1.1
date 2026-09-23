// Percurso analítico completo (secção E): estrutura → ciclo → colheita → despesa/afetação → indicador →
// tabela → exportação XLSX utilizável (fila persistente, download autenticado, releitura independente).
import fs from "node:fs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, createProject, createUser, setupTestApp } from "./helpers.js";
import { runOnce } from "../src/server/modules/jobs/queue.js";
import { exportJobHandler } from "../src/server/http/routes-data.js";
import { csvCell, toCsv } from "../src/server/modules/exports/excel.js";

let env: Awaited<ReturnType<typeof setupTestApp>>;
let author: Client;
let projectId: string;
const P = () => `/api/projects/${projectId}`;
const ids: Record<string, string> = {};

beforeAll(async () => {
  env = await setupTestApp();
  const uid = await createUser(env.pool, "autor@exemplo.org");
  projectId = await createProject(env.pool, uid, "vrban-dados");
  author = await new Client(env.app).login("autor@exemplo.org");
});
afterAll(async () => {
  await env.app.close();
  await env.pool.end();
});

const handlers = () => ({ "export.xlsx": exportJobHandler({ pool: env.pool, config: env.config, storage: env.storage }) as any });

describe("registo experimental e financeiro (fixtures didáticas isoladas)", () => {
  it("cria local, estrutura, cultura, ciclo", async () => {
    ids.loc = (await author.json("POST", `${P()}/e/location`, { name: "Local de teste", city: "Luanda", coords_private: "-8.8, 13.2" })).id;
    ids.st = (
      await author.json("POST", `${P()}/e/structure`, { code: "E1", location_id: ids.loc, levels: 3, footprint_area_m2: "10", cultivation_area_m2: "30" })
    ).id;
    ids.crop = (await author.json("POST", `${P()}/e/crop`, { name: "Salsa", variety: "Lisa" })).id;
    ids.cycle = (
      await author.json("POST", `${P()}/e/cycle`, { code: "C1", crop_id: ids.crop, structure_id: ids.st, start_date: "2026-01-01", end_date: "2026-03-01" })
    ).id;
    ids.cycle2 = (await author.json("POST", `${P()}/e/cycle`, { code: "C2", crop_id: ids.crop, structure_id: ids.st, area_fraction: "0.5" })).id;
  });

  it("valida regras de domínio e isolamento entre projetos", async () => {
    const bad = await author.req("POST", `${P()}/e/harvest`, { cycle_id: ids.cycle, harvest_date: "2026-02-01", gross_kg: "5", marketable_kg: "6" });
    expect(bad.statusCode).toBe(400);
    const impossible = await author.req("POST", `${P()}/e/harvest`, { cycle_id: ids.cycle, harvest_date: "2026-02-30" });
    expect(impossible.statusCode).toBe(400);
    const foreign = await author.req("POST", `${P()}/e/harvest`, { cycle_id: "00000000-0000-4000-8000-000000000001", harvest_date: "2026-02-01" });
    expect(foreign.statusCode).toBe(400);
    const endBefore = await author.req("POST", `${P()}/e/cycle`, { code: "CX", crop_id: ids.crop, structure_id: ids.st, start_date: "2026-03-01", end_date: "2026-01-01" });
    expect(endBefore.statusCode).toBe(400);
  });

  it("regista colheitas (ausência ≠ zero) e despesas repartidas", async () => {
    ids.h1 = (await author.json("POST", `${P()}/e/harvest`, { cycle_id: ids.cycle, harvest_date: "2026-02-01", gross_kg: "60", marketable_kg: "50", rejected_kg: "10" })).id;
    ids.h2 = (await author.json("POST", `${P()}/e/harvest`, { cycle_id: ids.cycle, harvest_date: "2026-02-15", gross_kg: "", marketable_kg: "50", notes: "=HYPERLINK(\"http://mal.example\")" })).id;
    const h2 = await author.json("GET", `${P()}/e/harvest/${ids.h2}`);
    expect(h2.gross_kg).toBeNull();
    ids.e1 = (await author.json("POST", `${P()}/e/expense`, { expense_date: "2026-01-05", category: "seeds", description: "Sementes (didático)", amount: "50000", currency: "aoa", supplier_private: "Fornecedor X" })).id;
    ids.e2 = (await author.json("POST", `${P()}/e/expense`, { expense_date: "2026-01-06", category: "substrate", description: "Substrato partilhado", amount: "20000", currency: "AOA" })).id;
    await author.json("POST", `${P()}/e/allocation`, { expense_id: ids.e1, cycle_id: ids.cycle, method: "direct", share: "1" });
    ids.a2 = (await author.json("POST", `${P()}/e/allocation`, { expense_id: ids.e2, cycle_id: ids.cycle2, method: "area", share: "0.5", justification: "Metade da área" })).id;
  });

  it("recusa repartição acima de 100%", async () => {
    const r = await author.req("POST", `${P()}/e/allocation`, { expense_id: ids.e1, cycle_id: ids.cycle2, method: "percentage", share: "0.1" });
    expect(r.statusCode).toBe(409);
    expect(r.json().message).toMatch(/excederia 100%/);
  });

  it("calcula indicadores verificáveis com parte não atribuída visível", async () => {
    const r = await author.json("GET", `${P()}/indicators`);
    const c1 = r.perCycle.find((c: any) => c.cycle.code === "C1").results;
    const get = (code: string) => c1.find((x: any) => x.code === code);
    expect(get("PROD_MKT").value).toBe("100");
    expect(get("COST_PER_KG").value).toBe("500");
    expect(get("YIELD_FOOTPRINT").value).toBe("10");
    expect(get("PROD_GROSS").status).toBe("partial");
    expect(get("COST_PER_KG").inputs.length).toBeGreaterThan(0);
    const c2 = r.perCycle.find((c: any) => c.cycle.code === "C2").results;
    expect(c2.find((x: any) => x.code === "OPCOST").value).toBe("10000");
    expect(c2.find((x: any) => x.code === "COST_PER_KG").status).toBe("insufficient_data");
    expect(r.unallocated).toEqual([{ expenseId: ids.e2, currency: "AOA", allocatedShare: "0.5", unallocatedAmount: "10000" }]);
  });

  it("correção preserva histórico e mostra impacto", async () => {
    const h = await author.json("GET", `${P()}/e/harvest/${ids.h1}`);
    await author.json("PATCH", `${P()}/e/harvest/${ids.h1}`, { version: h.version, marketable_kg: "40" });
    const stale = await author.req("PATCH", `${P()}/e/harvest/${ids.h1}`, { version: h.version, marketable_kg: "45" });
    expect(stale.statusCode).toBe(409);
    const hist = await author.json("GET", `${P()}/e/harvest/${ids.h1}/history`);
    expect(hist[0].before.marketable_kg).toBe("50.0000");
    expect(hist[0].after.marketable_kg).toBe("40.0000");
    const dep = await author.json("GET", `${P()}/e/harvest/${ids.h1}/dependents`);
    expect(dep.cycles.map((c: any) => c.code)).toEqual(["C1"]);
    expect(dep.indicators).toContain("COST_PER_KG");
    await author.json("PATCH", `${P()}/e/harvest/${ids.h1}`, { version: h.version + 1, marketable_kg: "50" });
  });
});

describe("exportação Excel", () => {
  it("pré-visualiza o escopo antes de gerar", async () => {
    const s = await author.json("POST", `${P()}/exports/xlsx/preview`, { cycleIds: [ids.cycle] });
    expect(s.scope).toMatch(/1 ciclo/);
    expect(s.sheets.find((x: any) => x.name === "Colheitas").rows).toBe(2);
    expect(s.sheets.find((x: any) => x.name === "Ciclos").rows).toBe(1);
    expect(s.includePrivate).toBe(false);
  });

  let fileId: string;
  it("gera XLSX em segundo plano de forma idempotente e descarrega com autenticação", async () => {
    const j1 = await author.json("POST", `${P()}/exports/xlsx`, { cycleIds: [ids.cycle], mode: "both" }, [202]);
    const again = await author.req("POST", `${P()}/exports/xlsx`, { cycleIds: [ids.cycle], mode: "both" }, { "idempotency-key": "k1" });
    const again2 = await author.req("POST", `${P()}/exports/xlsx`, { cycleIds: [ids.cycle], mode: "both" }, { "idempotency-key": "k1" });
    expect(again.json().id).toBe(again2.json().id);
    while (await runOnce(env.pool, handlers())) {
      /* processar fila */
    }
    const done = await author.json("GET", `${P()}/jobs/${j1.id}`);
    expect(done.status).toBe("succeeded");
    fileId = done.result.fileId;
    const anon = await env.app.inject({ method: "GET", url: `${P()}/files/${fileId}` });
    expect(anon.statusCode).toBe(401);
    const r = await author.req("GET", `${P()}/files/${fileId}`);
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("spreadsheetml");
    fs.mkdirSync("tmp", { recursive: true });
    fs.writeFileSync("tmp/test-export.xlsx", r.rawPayload);
  });

  it("o ficheiro abre e mantém tipos, IDs, acentos, fórmulas e privacidade", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile("tmp/test-export.xlsx");
    const names = wb.worksheets.map((w) => w.name);
    expect(names.slice(0, 3)).toEqual(["LEIA_ME", "Metadados", "Dicionario"]);
    expect(names).toEqual(expect.arrayContaining(["Colheitas", "Despesas", "Reparticoes", "Indicadores", "Formulas"]));
    const col = wb.getWorksheet("Colheitas")!;
    const header = (col.getRow(1).values as unknown[]).slice(1);
    expect(header).toContain("Peso comercializável (kg)");
    const hIdx = header.indexOf("Peso bruto (kg)") + 1;
    const nIdx = header.indexOf("Notas") + 1;
    const dIdx = header.indexOf("Data da colheita") + 1;
    const rows = [col.getRow(2), col.getRow(3)];
    expect(typeof rows[0]!.getCell(1).value).toBe("string"); // ID como texto
    expect(rows[0]!.getCell(dIdx).value).toBeInstanceOf(Date);
    expect(rows[1]!.getCell(hIdx).value).toBeNull(); // ausência = vazio (não zero)
    const note = rows[1]!.getCell(nIdx);
    expect(note.type).toBe(ExcelJS.ValueType.String); // texto iniciado por "=" não vira fórmula
    expect(note.value).toBe('=HYPERLINK("http://mal.example")');
    // Dados privados excluídos por defeito
    const desp = wb.getWorksheet("Despesas")!;
    expect((desp.getRow(1).values as unknown[]).join("|")).not.toContain("Fornecedor");
    // Moeda normalizada e número real
    const dHead = (desp.getRow(1).values as unknown[]).slice(1);
    expect(desp.getRow(2).getCell(dHead.indexOf("Valor total") + 1).value).toBe(50000);
    expect(desp.getRow(2).getCell(dHead.indexOf("Moeda") + 1).value).toBe("AOA");
    // Indicadores: valor do sistema + fórmula real com resultado coerente
    const ind = wb.getWorksheet("Indicadores")!;
    const iHead = (ind.getRow(1).values as unknown[]).slice(1);
    const codeCol = iHead.indexOf("Indicador (código)") + 1;
    const sysCol = iHead.indexOf("Valor calculado pelo sistema") + 1;
    const fCol = iHead.indexOf("Valor reproduzido no Excel (fórmula)") + 1;
    const find = (code: string) => {
      for (let i = 2; i <= ind.rowCount; i++) if (ind.getRow(i).getCell(codeCol).value === code) return ind.getRow(i);
      throw new Error(code);
    };
    const cpk = find("COST_PER_KG");
    expect(cpk.getCell(sysCol).value).toBe(500);
    const f = cpk.getCell(fCol).value as { formula: string; result: number };
    expect(f.formula).toMatch(/^[A-Z]+\d+\/[A-Z]+\d+$/);
    expect(f.result).toBe(500);
    const prod = find("PROD_MKT").getCell(fCol).value as { formula: string };
    expect(prod.formula).toMatch(/^SUMIFS\(Colheitas!/);
    const yf = find("YIELD_FOOTPRINT").getCell(fCol).value as { formula: string };
    expect(yf.formula).toContain("INDEX(Estruturas!");
    const zip = await JSZip.loadAsync(fs.readFileSync("tmp/test-export.xlsx"));
    expect(await zip.file("xl/workbook.xml")!.async("string")).toContain('fullCalcOnLoad="1"');
    expect(Object.keys(zip.files).some((f) => f.includes("vbaProject") || f.includes("externalLink"))).toBe(false);
    // Primeira linha fixa e filtro
    expect(col.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(col.autoFilter).toBeTruthy();
  });

  it("modelo vazio para recolha offline e escolha de folhas", async () => {
    const { buildResearchWorkbook } = await import("../src/server/modules/exports/excel.js");
    const { buffer, summary } = await buildResearchWorkbook(env.pool, projectId, { template: true, sheets: ["LEIA_ME", "Dicionario", "Colheitas"] });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["LEIA_ME", "Dicionario", "Colheitas"]);
    expect(wb.getWorksheet("Colheitas")!.rowCount).toBe(1);
    expect(summary.scope).toMatch(/Modelo vazio/);
  });

  it("CSV protege contra injeção de fórmulas e usa ; e BOM para Excel PT", async () => {
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
    expect(csvCell("+351")).toBe(`"'+351"`);
    expect(csvCell("@SUM(A1)")).toBe(`"'@SUM(A1)"`);
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(toCsv(["a"], [["x"]], { bom: true }).startsWith("﻿")).toBe(true);
    const r = await author.req("POST", `${P()}/exports/csv/harvest`, {});
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(`"'=HYPERLINK(""http://mal.example"")"`);
  });
});

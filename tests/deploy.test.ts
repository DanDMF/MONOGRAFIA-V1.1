// Alojamento sem terminal: armazenamento em PostgreSQL e provisionamento inicial do autor.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, setupTestApp } from "./helpers.js";
import { DbStorage } from "../src/server/lib/storage.js";
import { bootstrapAuthor } from "../src/server/lib/runtime.js";

let env: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  env = await setupTestApp();
});
afterAll(async () => {
  for (const k of ["VRBAN_BOOTSTRAP_EMAIL", "VRBAN_BOOTSTRAP_PASSWORD", "VRBAN_BOOTSTRAP_NAME", "VRBAN_BOOTSTRAP_PROJECT"]) delete process.env[k];
  await env.app.close();
  await env.pool.end();
});

describe("DbStorage", () => {
  it("guarda, lê, substitui e remove ficheiros; recusa chaves inseguras", async () => {
    const s = new DbStorage(env.pool);
    await s.put("projects/x/exports/a.xlsx", Buffer.from("um"));
    await s.put("projects/x/exports/a.xlsx", Buffer.from("dois"));
    expect((await s.get("projects/x/exports/a.xlsx")).toString()).toBe("dois");
    expect(await s.exists("projects/x/exports/a.xlsx")).toBe(true);
    await s.delete("projects/x/exports/a.xlsx");
    expect(await s.exists("projects/x/exports/a.xlsx")).toBe(false);
    await expect(s.put("../fora", Buffer.from("x"))).rejects.toThrow(/inválida/);
  });
});

describe("provisionamento inicial", () => {
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);
  it("sem variáveis não faz nada", async () => {
    expect(await bootstrapAuthor(env.pool, log)).toBe("skipped");
  });
  it("recusa palavra-passe fraca", async () => {
    process.env.VRBAN_BOOTSTRAP_EMAIL = "autor@exemplo.org";
    process.env.VRBAN_BOOTSTRAP_PASSWORD = "curta";
    expect(await bootstrapAuthor(env.pool, log)).toBe("refused");
  });
  it("cria o autor e o projeto uma única vez; o autor consegue entrar", async () => {
    process.env.VRBAN_BOOTSTRAP_PASSWORD = "palavra-passe-segura-123";
    process.env.VRBAN_BOOTSTRAP_NAME = "Autor Teste";
    expect(await bootstrapAuthor(env.pool, log)).toBe("created");
    const c = await new Client(env.app).login("autor@exemplo.org");
    const me = await c.json("GET", "/api/auth/me");
    expect(me.projects).toHaveLength(1);
    expect(me.projects[0].role).toBe("author");
    const sections = await c.json("GET", `/api/projects/${me.projects[0].id}/sections`);
    expect(sections.length).toBeGreaterThan(10);
    // segundo arranque: já existem contas → ignorado (mesmo com outra palavra-passe)
    process.env.VRBAN_BOOTSTRAP_PASSWORD = "outra-palavra-passe-1234";
    expect(await bootstrapAuthor(env.pool, log)).toBe("ignored");
    const n = await env.pool.query("select count(*)::int as n from app_user");
    expect(n.rows[0].n).toBe(1);
  });
});

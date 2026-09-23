// Infraestrutura de testes: base PostgreSQL isolada (TEST_DATABASE_URL), recriada a cada ficheiro.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { loadDotEnv } from "../src/server/lib/env.js";
import { createPool } from "../src/server/db/pool.js";
import { migrate } from "../src/server/db/migrate.js";
import { buildApp } from "../src/server/app.js";
import { loadConfig } from "../src/server/config.js";
import { LocalStorage } from "../src/server/lib/storage.js";
import { hashPassword } from "../src/server/auth/passwords.js";
import { createProjectFor } from "../src/server/http/routes-project.js";

loadDotEnv();

export async function setupTestApp() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/test/.test(url)) throw new Error("Defina TEST_DATABASE_URL (a base deve conter 'test' no nome; será limpa).");
  const pool = createPool(url);
  await pool.query("drop schema public cascade; create schema public;");
  await migrate(pool);
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "vrban-test-"));
  const storage = new LocalStorage(storageDir);
  const config = loadConfig({ databaseUrl: url, storageDir, production: false, publicBaseUrl: "https://vrban.example" });
  const app = await buildApp({ config, pool, storage });
  return { app, pool, storage, config };
}

export async function createUser(pool: ReturnType<typeof createPool>, email: string, password = "palavra-passe-segura-123") {
  const r = await pool.query<{ id: string }>("insert into app_user (email, display_name, password_hash) values ($1,$2,$3) returning id", [
    email,
    email.split("@")[0],
    await hashPassword(password),
  ]);
  return r.rows[0]!.id;
}

export async function createProject(pool: ReturnType<typeof createPool>, userId: string, slug = "vrban", template?: string) {
  const c = await pool.connect();
  try {
    return await createProjectFor(c, userId, { slug, name: "VRBAN", academicTitle: "Título de teste", authorName: "Autor Teste", template });
  } finally {
    c.release();
  }
}

export class Client {
  cookie = "";
  constructor(private app: FastifyInstance) {}
  async login(email: string, password = "palavra-passe-segura-123") {
    const r = await this.req("POST", "/api/auth/login", { email, password });
    if (r.statusCode !== 200) throw new Error("login falhou: " + r.body);
    const sc = r.headers["set-cookie"];
    this.cookie = (Array.isArray(sc) ? sc[0] : sc)!.split(";")[0]!;
    return this;
  }
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    return this.app.inject({
      method: method as "GET",
      url,
      payload: body === undefined ? undefined : (body as object),
      headers: { "x-requested-with": "vrban", ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
    });
  }
  async json<T = any>(method: string, url: string, body?: unknown, expected = [200, 201, 202]): Promise<T> {
    const r = await this.req(method, url, body);
    if (!expected.includes(r.statusCode)) throw new Error(`${method} ${url} → ${r.statusCode}: ${r.body}`);
    return r.json() as T;
  }
}

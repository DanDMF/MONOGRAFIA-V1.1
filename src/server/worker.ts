// Worker da fila persistente: processa exportações e outras tarefas demoradas.
import { loadDotEnv } from "./lib/env.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { LocalStorage } from "./lib/storage.js";
import { runOnce } from "./modules/jobs/queue.js";
import { documentJobHandler, exportJobHandler } from "./http/routes-data.js";
import type { JobHandler } from "./modules/jobs/queue.js";

loadDotEnv();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const ctx = { pool, config, storage: new LocalStorage(config.storageDir) };
export const handlers: Record<string, JobHandler> = {
  "export.xlsx": exportJobHandler(ctx) as unknown as JobHandler,
  "export.document": documentJobHandler(ctx) as unknown as JobHandler,
};

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
console.log("Worker VRBAN ativo.");
while (!stopping) {
  try {
    const worked = await runOnce(pool, handlers);
    if (!worked) await new Promise((r) => setTimeout(r, 1500));
  } catch (e) {
    console.error("Erro no worker:", (e as Error).message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
await pool.end();

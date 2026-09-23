// Worker da fila persistente: processa exportações e outras tarefas demoradas (processo separado).
import { loadDotEnv } from "./lib/env.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { createStorage, jobHandlers, workerLoop } from "./lib/runtime.js";

loadDotEnv();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const ctx = { pool, config, storage: createStorage(config, pool) };
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));
console.log("Worker VRBAN ativo.");
await workerLoop(pool, jobHandlers(ctx), () => stopping);
await pool.end();

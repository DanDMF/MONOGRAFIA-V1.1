import { loadDotEnv } from "./lib/env.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { buildApp } from "./app.js";
import { bootstrapAuthor, createStorage, jobHandlers, workerLoop } from "./lib/runtime.js";

loadDotEnv();
const config = loadConfig();
const pool = createPool(config.databaseUrl);

// Alojamento sem terminal: aplicar migrações no arranque (nunca apagam dados).
if (process.env.MIGRATE_ON_START === "true") {
  const applied = await migrate(pool, undefined, (m) => console.log(m));
  console.log(applied.length ? `${applied.length} migração(ões) aplicada(s).` : "Base já atualizada.");
} else {
  const n = await pool
    .query<{ n: string }>("select count(*) as n from schema_migration")
    .then((r) => Number(r.rows[0]?.n ?? 0))
    .catch(() => 0);
  if (!n) console.warn("Aviso: base sem migrações aplicadas. Execute `npm run db:migrate`.");
}
await bootstrapAuthor(pool);

const storage = createStorage(config, pool);
const app = await buildApp({ config, pool, storage, logger: true });
await app.listen({ port: config.port, host: config.host });

// Um único serviço: a fila de exportações corre no mesmo processo (RUN_WORKER_IN_PROCESS=true).
let stopping = false;
let worker: Promise<void> = Promise.resolve();
if (process.env.RUN_WORKER_IN_PROCESS === "true") {
  console.log("Fila de exportações ativa neste processo.");
  worker = workerLoop(pool, jobHandlers({ pool, config, storage }), () => stopping);
}

// Paragem ordenada (reinícios do alojamento): deixa de aceitar pedidos, termina a tarefa em curso e fecha a base.
// Uma tarefa interrompida à força volta à fila pela recuperação de órfãs.
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`${signal}: a terminar…`);
  setTimeout(() => process.exit(1), 25_000).unref();
  await app.close().catch(() => {});
  await worker.catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

import { loadDotEnv } from "./lib/env.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { LocalStorage } from "./lib/storage.js";
import { buildApp } from "./app.js";

loadDotEnv();
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const pending = await pool
  .query<{ n: string }>("select count(*) as n from schema_migration")
  .then((r) => Number(r.rows[0]?.n ?? 0))
  .catch(() => 0);
if (!pending) console.warn("Aviso: base sem migrações aplicadas. Execute `npm run db:migrate`.");
const app = await buildApp({ config, pool, storage: new LocalStorage(config.storageDir), logger: true });
await app.listen({ port: config.port, host: config.host });

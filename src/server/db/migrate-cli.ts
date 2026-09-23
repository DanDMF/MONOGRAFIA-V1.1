import { loadDotEnv } from "../lib/env.js";
import { createPool } from "./pool.js";
import { migrate } from "./migrate.js";

loadDotEnv();
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida (ver .env.example).");
  process.exit(1);
}
const pool = createPool(url);
migrate(pool, undefined, (m) => console.log(m))
  .then((applied) => console.log(applied.length ? `${applied.length} migração(ões) aplicada(s).` : "Base já atualizada."))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

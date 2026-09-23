// Carrega .env de forma mínima (sem dependência), sem sobrescrever variáveis já definidas.
import fs from "node:fs";

export function loadDotEnv(file = ".env"): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith("#")) continue;
    const [, key, raw] = m as unknown as [string, string, string];
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

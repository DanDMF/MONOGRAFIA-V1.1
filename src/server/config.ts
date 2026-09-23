import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente em falta: ${name} (ver .env.example)`);
  return v;
}

export interface AppConfig {
  databaseUrl: string;
  port: number;
  host: string;
  publicBaseUrl: string;
  storageDir: string;
  production: boolean;
  sessionTtlHours: number;
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    databaseUrl: overrides.databaseUrl ?? required("DATABASE_URL"),
    port: overrides.port ?? Number(process.env.PORT ?? 3000),
    host: overrides.host ?? process.env.HOST ?? "127.0.0.1",
    publicBaseUrl: overrides.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:5173",
    storageDir: path.resolve(overrides.storageDir ?? process.env.STORAGE_DIR ?? "./storage"),
    production: overrides.production ?? process.env.NODE_ENV === "production",
    sessionTtlHours: overrides.sessionTtlHours ?? Number(process.env.SESSION_TTL_HOURS ?? 336),
  };
}

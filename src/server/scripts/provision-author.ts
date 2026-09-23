// Provisionamento explícito do autor: cria a conta (se não existir) e concede papel "author" num projeto.
// Não há palavras-passe predefinidas: a palavra-passe é pedida no terminal ou lida de VRBAN_AUTHOR_PASSWORD.
// Uso: npm run author:provision -- --email autor@exemplo.org --name "Nome" --project vrban [--create-project "VRBAN"]
import readline from "node:readline/promises";
import { loadDotEnv } from "../lib/env.js";
import { createPool, one, q, tx } from "../db/pool.js";
import { hashPassword, validatePasswordStrength } from "../auth/passwords.js";
import { createProjectFor } from "../http/routes-project.js";

loadDotEnv();
const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = arg("email");
const name = arg("name");
const slug = arg("project");
const createName = arg("create-project");
if (!email || !name || !slug) {
  console.error('Uso: npm run author:provision -- --email <email> --name "<nome>" --project <slug> [--create-project "<nome do projeto>"]');
  process.exit(1);
}
let password = process.env.VRBAN_AUTHOR_PASSWORD;
const pool = createPool(process.env.DATABASE_URL!);
try {
  const existing = await one<{ id: string }>(pool, "select id from app_user where lower(email) = lower($1)", [email]);
  if (!existing && !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Palavra-passe (mín. 12 caracteres): ");
    rl.close();
  }
  if (!existing) {
    const err = validatePasswordStrength(password ?? "");
    if (err) throw new Error(err);
  }
  await tx(pool, async (c) => {
    const userId =
      existing?.id ??
      (await one<{ id: string }>(c, "insert into app_user (email, display_name, password_hash) values ($1,$2,$3) returning id", [
        email,
        name,
        await hashPassword(password!),
      ]))!.id;
    let project = await one<{ id: string }>(c, "select id from project where slug = $1", [slug]);
    if (!project) {
      if (!createName) throw new Error(`Projeto "${slug}" não existe. Use --create-project "<nome>" para o criar.`);
      const id = await createProjectFor(c, userId, { slug, name: createName, authorName: name, template: "empirical_monograph" });
      project = { id };
    } else {
      await q(
        c,
        `insert into project_member (project_id, user_id, role, granted_by) values ($1,$2,'author',$2)
         on conflict (project_id, user_id) do update set role = 'author', revoked_at = null`,
        [project.id, userId],
      );
    }
    console.log(`Autor ${email} autorizado no projeto "${slug}".`);
  });
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

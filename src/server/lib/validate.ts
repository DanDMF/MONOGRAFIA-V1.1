import { z } from "zod";
import { badRequest } from "./errors.js";

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    throw badRequest("Dados inválidos: " + issues.map((i) => `${i.path || "(raiz)"}: ${i.message}`).join("; "), issues);
  }
  return r.data;
}

export const uuid = z.string().uuid();

/** Decimal como string normalizada (sem perda de precisão). Vazio → null (ausência ≠ zero). */
export const decimalString = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const s = typeof v === "number" ? String(v) : v.trim().replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Número decimal inválido" });
      return z.NEVER;
    }
    return s;
  });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (AAAA-MM-DD)").refine((s) => {
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, "Data impossível");

/** Converte "" em null antes de validar. */
export const emptyToNull = (v: unknown) => (v === "" ? null : v);

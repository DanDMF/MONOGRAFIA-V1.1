import { hash, verify } from "@node-rs/argon2";

// Argon2id com parâmetros por omissão da biblioteca (@node-rs/argon2).
export const hashPassword = (plain: string) => hash(plain);
export const verifyPassword = (hashed: string, plain: string) => verify(hashed, plain).catch(() => false);

export function validatePasswordStrength(p: string): string | null {
  if (p.length < 12) return "A palavra-passe deve ter pelo menos 12 caracteres.";
  return null;
}

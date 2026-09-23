import crypto from "node:crypto";
import type { Queryable } from "../db/pool.js";
import { one, q } from "../db/pool.js";

export const SESSION_COOKIE = "vrban_session";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export interface SessionUser {
  id: string;
  email: string;
  display_name: string;
}

export async function createSession(db: Queryable, userId: string, ttlHours: number, userAgent?: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await q(
    db,
    `insert into user_session (token_hash, user_id, expires_at, user_agent)
     values ($1, $2, now() + ($3 || ' hours')::interval, $4)`,
    [sha256(token), userId, String(ttlHours), userAgent?.slice(0, 300) ?? null],
  );
  return token;
}

export async function resolveSession(db: Queryable, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await one<SessionUser>(
    db,
    `update user_session s set last_seen_at = now()
       from app_user u
      where s.token_hash = $1 and s.expires_at > now() and u.id = s.user_id and u.disabled_at is null
      returning u.id, u.email, u.display_name`,
    [sha256(token)],
  );
  return row ?? null;
}

export async function destroySession(db: Queryable, token: string | undefined): Promise<void> {
  if (token) await q(db, "delete from user_session where token_hash = $1", [sha256(token)]);
}

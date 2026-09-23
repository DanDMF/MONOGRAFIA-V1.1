import type { Queryable } from "../db/pool.js";
import { q } from "../db/pool.js";

export interface AuditInput {
  projectId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/** Regista um evento de auditoria (histórico de valores anteriores/novos). */
export async function audit(db: Queryable, e: AuditInput): Promise<void> {
  await q(
    db,
    `insert into audit_event (project_id, user_id, action, entity_type, entity_id, summary, before, after)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      e.projectId,
      e.userId,
      e.action,
      e.entityType,
      e.entityId ?? null,
      e.summary ?? null,
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
    ],
  );
}

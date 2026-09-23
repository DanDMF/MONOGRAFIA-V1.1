-- VRBAN 0005 — Exceções justificadas da auditoria académica (secção 20).
-- Um aviso da auditoria pode ser aceite com justificação escrita; a justificação fica auditada e pode ser revogada.

create table audit_exception (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project(id) on delete cascade,
  finding_key   text not null,          -- verificação + alvo (estável entre execuções)
  check_code    text not null,
  justification text not null check (length(trim(justification)) >= 10),
  created_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz
);
create unique index audit_exception_active_uq on audit_exception (project_id, finding_key) where revoked_at is null;

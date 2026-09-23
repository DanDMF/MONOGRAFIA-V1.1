-- VRBAN 0006 — Armazenamento de ficheiros na própria base (opção STORAGE_DRIVER=db).
-- Útil em alojamentos sem disco persistente: os ficheiros sobrevivem a reinícios e entram nos backups da base.

create table stored_blob (
  key        text primary key,
  data       bytea not null,
  created_at timestamptz not null default now()
);

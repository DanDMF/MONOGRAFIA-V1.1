-- VRBAN 0004 — Publicações imutáveis (snapshots).
-- Requisitos: VRB-041-*, VRB-004-004, VRB-047-D*.
-- A área pública lê exclusivamente destas tabelas; rascunhos nunca são servidos publicamente.

create table publication (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project(id) on delete cascade,
  number        integer not null,
  label         text not null,               -- ex.: "v1"
  note          text,                        -- nota de versão
  manifest      jsonb not null,              -- lista de itens, versões de origem, versão do cálculo/estilo
  created_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  withdrawn_at  timestamptz,
  unique (project_id, number)
);

create table publication_item (
  publication_id uuid not null references publication(id) on delete cascade,
  item_type      text not null check (item_type in ('project','section','bibliography','indicators','dataset','file')),
  item_key       text not null,
  position       integer not null default 0,
  source_id      uuid,
  source_version integer,
  content        jsonb not null,
  primary key (publication_id, item_type, item_key)
);

-- Versão apresentada ao público (pode voltar-se a uma versão anterior não retirada).
alter table project add column current_publication_id uuid references publication(id);

-- Snapshots são imutáveis: impedir UPDATE do conteúdo.
create function publication_item_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'Itens de publicação são imutáveis.' using errcode = '55000';
end $$;
create trigger publication_item_no_update before update on publication_item
  for each row execute function publication_item_immutable();

-- VRBAN 0001 — Fundação: identidades, projeto, permissões, auditoria, ficheiros e fila persistente.
-- Requisitos: VRB-004-*, VRB-044-*, VRB-056-*, VRB-C-*.

create table app_user (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  display_name  text not null,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  disabled_at   timestamptz
);
create unique index app_user_email_uq on app_user (lower(email));

-- Sessões do servidor. Guarda-se apenas o hash do token; o token em claro existe só no cookie.
create table user_session (
  token_hash   text primary key,
  user_id      uuid not null references app_user(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent   text
);
create index user_session_user_idx on user_session (user_id);

create table project (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name             text not null,                      -- ex.: VRBAN (provisório)
  academic_title   text,                               -- título académico (independente do nome)
  author_name      text,
  author_family    text,                               -- para "Como citar" (não inferido do nome completo)
  author_given     text,
  degree           text,
  institution      text,
  advisor          text,
  academic_year    text,
  study_status     text not null default 'Investigação em desenvolvimento',
  ui_locale        text not null default 'pt-PT',
  citation_locale  text not null default 'pt-PT' check (citation_locale in ('pt-PT','en-US')),
  timezone         text not null default 'Africa/Luanda',
  default_currency char(3) not null default 'AOA',
  is_demo          boolean not null default false,     -- ambiente de demonstração isolado e identificado
  public_summary   text,
  central_question text,
  version          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Lista explícita de contas autorizadas. Autenticar não concede edição.
create table project_member (
  project_id uuid not null references project(id) on delete cascade,
  user_id    uuid not null references app_user(id) on delete cascade,
  role       text not null check (role in ('author','reviewer')),
  granted_at timestamptz not null default now(),
  granted_by uuid references app_user(id),
  revoked_at timestamptz,
  primary key (project_id, user_id)
);

create table audit_event (
  id          bigserial primary key,
  project_id  uuid references project(id) on delete cascade,
  user_id     uuid references app_user(id),
  action      text not null,          -- create | update | archive | restore | publish | export | import | login ...
  entity_type text not null,
  entity_id   text,
  summary     text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index audit_event_entity_idx on audit_event (project_id, entity_type, entity_id, created_at desc);
create index audit_event_time_idx on audit_event (project_id, created_at desc);

-- Ficheiros: metadados na base, conteúdo no armazenamento (interface Storage).
create table stored_file (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project(id) on delete cascade,
  storage_key   text not null unique,
  original_name text not null,
  content_type  text not null,
  size_bytes    bigint not null,
  sha256        text not null,
  purpose       text not null default 'attachment', -- attachment | export | backup | inbox | photo_public
  visibility    text not null default 'private' check (visibility in ('private','public')),
  expires_at    timestamptz,                         -- exportações com validade limitada
  created_by    uuid references app_user(id),
  created_at    timestamptz not null default now()
);
create index stored_file_project_idx on stored_file (project_id, purpose);
create index stored_file_sha_idx on stored_file (project_id, sha256);

-- Fila persistente em PostgreSQL (FOR UPDATE SKIP LOCKED), com idempotência e retentativas limitadas.
create table job (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references project(id) on delete cascade,
  kind            text not null,
  payload         jsonb not null default '{}',
  status          text not null default 'pending'
                  check (status in ('pending','running','succeeded','failed','cancelled')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 3,
  run_after       timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  idempotency_key text unique,
  progress        jsonb,
  result          jsonb,
  error           text,
  cancel_requested boolean not null default false,
  created_by      uuid references app_user(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);
create index job_pending_idx on job (run_after) where status = 'pending';
create index job_project_idx on job (project_id, created_at desc);

-- VRBAN 0002 — Conteúdo académico, versões, bibliografia, citações como objetos e fichas de leitura.
-- Requisitos: VRB-009-*, VRB-011-*, VRB-012-*, VRB-013-*, VRB-014-*, VRB-015-*, VRB-017-*, VRB-018-*.

create table section (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references project(id) on delete cascade,
  parent_id           uuid references section(id),
  kind                text not null check (kind in ('preliminary','chapter','section','appendix','final')),
  template_key        text,                  -- ex.: 'intro', 'methodology' (modelo de origem, editável)
  title               text not null,
  position            integer not null,
  numbered            boolean not null default true,
  status              text not null default 'not_started'
                      check (status in ('not_started','drafting','needs_source','in_review','ready','published')),
  guidance            text,                  -- sugestão editável do modelo (não é texto pré-redigido)
  include_in_word_count boolean not null default true,
  weight              numeric(6,2),          -- peso explícito opcional para progresso
  current_revision_id uuid,
  version             integer not null default 0,   -- controlo de concorrência otimista do conteúdo
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index section_tree_idx on section (project_id, parent_id, position);

create table section_revision (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references section(id) on delete cascade,
  project_id    uuid not null references project(id) on delete cascade,
  number        integer not null,
  doc           jsonb not null,             -- documento estruturado (ProseMirror/TipTap JSON), sanitizado
  word_count    integer not null default 0,
  autosave      boolean not null default true,  -- gravações automáticas próximas são coalescidas; "Guardar versão" cria marco
  note          text,
  restored_from uuid references section_revision(id),
  created_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (section_id, number)
);
alter table section add constraint section_current_revision_fk
  foreign key (current_revision_id) references section_revision(id);

-- Biblioteca bibliográfica
create table reference (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references project(id) on delete cascade,
  type                 text not null check (type in (
                         'article','book','chapter','report','thesis','webpage','dataset','software',
                         'preprint','presentation','video','image','legal','other')),
  title                text not null,
  container_title      text,           -- revista, livro, site
  site_name            text,
  issued_year          integer,
  issued_month         integer check (issued_month between 1 and 12),
  issued_day           integer check (issued_day between 1 and 31),
  issued_season        text,
  no_date              boolean not null default false,  -- sem data (s.d./n.d.) explícito
  volume               text,
  issue                text,
  pages                text,
  article_number       text,
  edition              text,
  publisher            text,
  institution          text,
  genre                text,          -- descrição: ex. "Dissertação de mestrado", "Relatório técnico"
  thesis_published     boolean,
  archive              text,          -- repositório/base
  report_number        text,
  version_label        text,
  medium               text,          -- ex.: [Conjunto de dados], [Software]
  doi                  text,
  url                  text,
  isbn                 text,
  language             text,
  accessed_date        date,          -- guardada sempre; mostrada só quando a regra o exige
  show_accessed        boolean not null default false,
  license              text,
  tags                 text[] not null default '{}',
  notes                text,
  abstract             text,
  read_status          text not null default 'to_read' check (read_status in ('to_read','reading','read','skimmed')),
  verification_status  text not null default 'unverified'
                       check (verification_status in ('unverified','author_confirmed','checked_at_source')),
  metadata_source      text,          -- manual | bibtex | ris | csl-json | doi-lookup | extraction
  archived_at          timestamptz,
  merged_into          uuid references reference(id),
  version              integer not null default 1,
  created_by           uuid references app_user(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index reference_project_idx on reference (project_id) where archived_at is null;
create index reference_doi_idx on reference (project_id, lower(doi));

-- Autores ordenados; nomes preservados tal como introduzidos (sem separação inferida silenciosamente).
create table reference_contributor (
  id             uuid primary key default gen_random_uuid(),
  reference_id   uuid not null references reference(id) on delete cascade,
  role           text not null default 'author' check (role in ('author','editor','translator','director','host')),
  position       integer not null,
  family         text,
  given          text,
  particle       text,     -- partículas não descartáveis, ex.: "de", "van"
  suffix         text,
  literal        text,     -- autor institucional
  abbreviation   text,     -- sigla opcional de autor institucional (ex.: IEU)
  unique (reference_id, role, position),
  check (literal is not null or family is not null)
);

-- Comunicações pessoais: fluxo próprio, privadas, excluídas da lista de referências.
create table personal_communication (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references project(id) on delete cascade,
  given_initials     text not null,
  family             text not null,
  communication_date date not null,
  medium             text,
  authorization_note text,
  private_contact    text,      -- nunca publicado
  version            integer not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);

-- Excertos e fichas de leitura
create table excerpt (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references project(id) on delete cascade,
  reference_id   uuid not null references reference(id),
  kind           text not null check (kind in ('literal','paraphrase','comment')),
  text           text not null,
  locator_label  text check (locator_label in ('page','paragraph','section','timestamp','figure','table','chapter')),
  locator        text,           -- página impressa / parágrafo / secção / timestamp
  pdf_page_index integer,        -- índice da página no ficheiro PDF (distinto da página impressa)
  is_translation boolean not null default false,
  note           text,
  version        integer not null default 1,
  archived_at    timestamptz,
  created_by     uuid references app_user(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index excerpt_reference_idx on excerpt (reference_id);

create table reading_note (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references project(id) on delete cascade,
  reference_id    uuid not null references reference(id) unique,
  study_problem   text,
  method          text,
  place           text,
  sample          text,
  relevant_results text,
  limitations     text,
  concepts        text,
  usable_data     text,
  units           text,
  pages           text,
  relevance       text,
  version         integer not null default 1,
  updated_at      timestamptz not null default now()
);

-- Índice canónico de citações, derivado dos nós de citação guardados nas secções.
-- O ID é o do nó no documento; é reconstruído a cada gravação da secção.
create table citation (
  id             uuid primary key,
  project_id     uuid not null references project(id) on delete cascade,
  section_id     uuid not null references section(id) on delete cascade,
  position       integer not null,       -- ordem dentro da secção
  mode           text not null check (mode in ('narrative','parenthetical','quote_short','quote_block','secondary','personal')),
  quote_text     text,
  secondary_author text,
  secondary_year   text,
  prefix         text,
  suffix         text,
  excerpt_id     uuid references excerpt(id),
  attrs          jsonb not null,        -- atributos completos do nó (prefixos, sufixos, forma narrativa)
  updated_at     timestamptz not null default now()
);
create index citation_section_idx on citation (section_id, position);

create table citation_item (
  citation_id     uuid not null references citation(id) on delete cascade,
  position        integer not null,
  reference_id    uuid references reference(id),
  personal_communication_id uuid references personal_communication(id),
  locator_label   text,
  locator         text,
  primary key (citation_id, position),
  check ((reference_id is null) <> (personal_communication_id is null))
);
create index citation_item_reference_idx on citation_item (reference_id);

-- Comentários privados de revisão, ancorados em secções.
create table review_comment (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  section_id  uuid references section(id) on delete cascade,
  anchor_text text,
  body        text not null,
  resolved_at timestamptz,
  created_by  uuid references app_user(id),
  created_at  timestamptz not null default now()
);

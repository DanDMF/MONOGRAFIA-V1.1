-- Próximo parágrafo (secção 12 / VRB-012-001): cartões que levam uma ideia até um parágrafo integrado.
-- Fluxo: ideia → pesquisa → leitura → notas → redação → revisão → integrado.
-- O cartão mantém ligação às fontes (com localização) e aos excertos; a integração regista a secção
-- e a revisão onde o parágrafo entrou. O parágrafo no documento guarda o ID do cartão (atributo cardId).

create table paragraph_card (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references project(id) on delete cascade,
  section_id             uuid references section(id),          -- capítulo/secção de destino
  idea                   text not null,
  question               text,
  stage                  text not null default 'idea'
                           check (stage in ('idea','research','reading','notes','drafting','review','integrated')),
  interpretation         text,                                  -- interpretação própria do autor
  draft                  text,                                  -- rascunho do parágrafo (texto simples)
  next_action            text,
  next_action_date       date,
  integrated_section_id  uuid references section(id),
  integrated_revision_id uuid references section_revision(id),
  integrated_at          timestamptz,
  version                integer not null default 1,
  archived_at            timestamptz,
  created_by             uuid references app_user(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  check ((stage = 'integrated') = (integrated_at is not null))
);
create index paragraph_card_project_idx on paragraph_card (project_id, stage) where archived_at is null;

create table paragraph_card_source (
  card_id       uuid not null references paragraph_card(id) on delete cascade,
  reference_id  uuid not null references reference(id),
  position      integer not null,
  locator_label text check (locator_label in ('page','paragraph','section','timestamp','figure','table','chapter')),
  locator       text,
  primary key (card_id, reference_id)
);

create table paragraph_card_excerpt (
  card_id    uuid not null references paragraph_card(id) on delete cascade,
  excerpt_id uuid not null references excerpt(id),
  position   integer not null,
  primary key (card_id, excerpt_id)
);

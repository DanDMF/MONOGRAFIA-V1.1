-- VRBAN 0003 — Protocolo, variáveis, locais, estruturas, culturas, ciclos, registos de campo,
-- colheitas, consumos, trabalho, ativos, despesas, repartições, vendas e taxas de câmbio.
-- Requisitos: VRB-023-* a VRB-029-*.
-- Regras: valores ausentes são NULL (nunca zero implícito); dinheiro em numeric; moeda sempre explícita.

create table protocol_version (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references project(id) on delete cascade,
  number         integer not null,
  title          text not null,
  effective_from date,
  responsible    text,
  instruments    text,
  frequency      text,
  procedures     text,
  exclusion_criteria text,
  deviations     text,
  supersedes_id  uuid references protocol_version(id),
  created_by     uuid references app_user(id),
  created_at     timestamptz not null default now(),
  archived_at    timestamptz,
  version        integer not null default 1,
  updated_at     timestamptz not null default now(),
  unique (project_id, number)
);

create table variable (
  id                     uuid primary key default gen_random_uuid(),
  project_id             uuid not null references project(id) on delete cascade,
  code                   text not null,
  name                   text not null,
  operational_definition text,
  role                   text,       -- dependente | independente | controlo | descritiva | económica
  data_type              text,       -- numérica | categórica | data | texto
  unit                   text,
  method                 text,
  instrument             text,
  periodicity            text,
  plausible_min          numeric,
  plausible_max          numeric,
  missing_rule           text,
  transformation         text,
  source                 text,
  experimental_unit      text,
  observation_unit       text,
  notes                  text,
  version                integer not null default 1,
  archived_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (project_id, code)
);

create table location (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references project(id) on delete cascade,
  name           text not null,
  city           text,
  public_label   text,          -- designação genérica publicável (ex.: "Luanda")
  description    text,
  coords_private text,          -- coordenadas/morada exata: nunca públicas
  is_public      boolean not null default false,
  version        integer not null default 1,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table structure (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references project(id) on delete cascade,
  location_id         uuid not null references location(id),
  code                text not null,
  system              text,
  levels              integer check (levels >= 0),
  containers          integer check (containers >= 0),
  capacity_plants     integer check (capacity_plants >= 0),
  equipment           text,
  footprint_area_m2   numeric(12,4) check (footprint_area_m2 >= 0),   -- área de implantação no solo
  cultivation_area_m2 numeric(12,4) check (cultivation_area_m2 >= 0), -- área total de cultivo (soma dos níveis)
  useful_area_m2      numeric(12,4) check (useful_area_m2 >= 0),      -- área útil efetivamente ocupada
  circulation_area_m2 numeric(12,4) check (circulation_area_m2 >= 0),
  area_notes          text,      -- fronteiras de cada denominador
  in_use_from         date,
  in_use_to           date,
  version             integer not null default 1,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, code)
);

create table crop (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references project(id) on delete cascade,
  name            text not null,
  variety         text,
  scientific_name text,
  seed_supplier   text,
  notes           text,
  version         integer not null default 1,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table cycle (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references project(id) on delete cascade,
  code                text not null,
  crop_id             uuid not null references crop(id),
  structure_id        uuid not null references structure(id),
  protocol_version_id uuid references protocol_version(id),
  lot                 text,
  sowing_date         date,
  transplant_date     date,
  start_date          date,
  end_date            date,
  initial_plants      integer check (initial_plants >= 0),
  substrate           text,
  irrigation          text,
  status              text not null default 'planned'
                      check (status in ('planned','active','finished','failed','cancelled')),
  area_fraction       numeric(7,6) not null default 1 check (area_fraction > 0 and area_fraction <= 1),
  notes               text,
  version             integer not null default 1,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (project_id, code),
  check (end_date is null or start_date is null or end_date >= start_date)
);

-- Origem dos dados: nunca misturar estados.
create domain data_origin as text check (value in ('measured','document','estimate','literature','assumption'));

create table field_event (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  cycle_id    uuid not null references cycle(id),
  event_type  text not null check (event_type in ('irrigation','fertilization','growth','pest','disease','loss',
                                                  'maintenance','intervention','photo','note')),
  occurred_on date not null,
  value       numeric,
  unit        text,
  origin      data_origin not null default 'measured',
  method      text,
  description text,
  version     integer not null default 1,
  archived_at timestamptz,
  created_by  uuid references app_user(id),
  created_at  timestamptz not null default now(),   -- data de introdução
  updated_at  timestamptz not null default now()
);

create table harvest (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project(id) on delete cascade,
  cycle_id      uuid not null references cycle(id),
  harvest_date  date not null,
  gross_kg      numeric(14,4) check (gross_kg >= 0),
  marketable_kg numeric(14,4) check (marketable_kg >= 0),
  rejected_kg   numeric(14,4) check (rejected_kg >= 0),
  units_count   integer check (units_count >= 0),
  unit_label    text,          -- ex.: maço, embalagem
  destination   text check (destination in ('stock','sale','own_consumption','sample','loss','mixed')),
  origin        data_origin not null default 'measured',
  method        text,
  instrument    text,
  notes         text,
  version       integer not null default 1,
  archived_at   timestamptz,
  created_by    uuid references app_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index harvest_cycle_idx on harvest (cycle_id, harvest_date);

create table consumption (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project(id) on delete cascade,
  resource      text not null check (resource in ('water','energy','other')),
  structure_id  uuid references structure(id),
  cycle_id      uuid references cycle(id),
  period_start  date,
  period_end    date,
  reading_start numeric(16,4),
  reading_end   numeric(16,4),
  quantity      numeric(16,4),
  unit          text not null check (unit in ('L','m3','Wh','kWh','h','other')),
  power_w       numeric(12,2),
  hours_used    numeric(12,2),
  instrument    text,
  origin        data_origin not null default 'measured',
  notes         text,
  version       integer not null default 1,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table labor_entry (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references project(id) on delete cascade,
  cycle_id     uuid references cycle(id),
  work_date    date not null,
  hours        numeric(10,2) not null check (hours >= 0),
  task         text,
  worker_label text,
  is_paid      boolean not null default false,       -- trabalho pago vs. valorização do trabalho do autor
  hourly_rate  numeric(14,2),
  currency     char(3),
  origin       data_origin not null default 'measured',
  notes        text,
  version      integer not null default 1,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table asset (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references project(id) on delete cascade,
  name                text not null,
  category            text,
  acquired_on         date,
  in_use_from         date,
  cost                numeric(18,2) not null check (cost >= 0),
  installation_cost   numeric(18,2) check (installation_cost >= 0),
  currency            char(3) not null,
  useful_life_months  integer check (useful_life_months > 0),
  residual_value      numeric(18,2) check (residual_value >= 0),
  depreciation_method text not null default 'linear' check (depreciation_method in ('linear','none')),
  structure_id        uuid references structure(id),
  receipt_file_id     uuid references stored_file(id),
  notes               text,
  version             integer not null default 1,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table expense (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references project(id) on delete cascade,
  expense_date         date not null,
  category             text not null check (category in ('seeds','substrate','fertilizer','water','energy','labor',
                                                         'transport','packaging','maintenance','other')),
  description          text not null,
  supplier_private     text,
  quantity             numeric(14,4),
  unit                 text,
  unit_price           numeric(18,4),
  tax_amount           numeric(18,2),
  amount               numeric(18,2) not null check (amount >= 0),
  currency             char(3) not null,
  cost_behavior        text not null default 'variable' check (cost_behavior in ('fixed','variable')),
  is_operational       boolean not null default true,
  origin               data_origin not null default 'document',
  replaces_expense_id  uuid references expense(id),   -- fatura real que substitui estimativa (evita dupla contagem)
  receipt_file_id      uuid references stored_file(id),
  notes                text,
  version              integer not null default 1,
  archived_at          timestamptz,
  created_by           uuid references app_user(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Repartição de custos partilhados. Soma das frações por despesa ≤ 1 (garantido por trigger).
create table allocation (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project(id) on delete cascade,
  expense_id    uuid not null references expense(id) on delete cascade,
  cycle_id      uuid not null references cycle(id),
  method        text not null check (method in ('direct','area','time','measured','production','percentage')),
  share         numeric(9,8) not null check (share > 0 and share <= 1),
  justification text,
  version       integer not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (expense_id, cycle_id)
);

create function allocation_share_check() returns trigger language plpgsql as $$
declare total numeric;
begin
  select coalesce(sum(share), 0) into total from allocation where expense_id = new.expense_id;
  if total > 1.00000001 then
    raise exception 'A soma das repartições da despesa % excede 100%% (%).', new.expense_id, total
      using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger allocation_share_ck after insert or update on allocation
  deferrable initially immediate for each row execute function allocation_share_check();

create table sale (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references project(id) on delete cascade,
  cycle_id             uuid references cycle(id),
  crop_id              uuid references crop(id),
  sale_date            date not null,
  quantity             numeric(14,4) not null check (quantity >= 0),
  commercial_unit      text not null,           -- kg, maço, embalagem...
  kg_equivalent        numeric(14,4),           -- só quando medido ou pressuposto identificado
  kg_equivalent_origin data_origin,
  unit_price           numeric(18,4),
  discount             numeric(18,2),
  amount               numeric(18,2) not null check (amount >= 0),
  currency             char(3) not null,
  channel              text,
  notes                text,
  version              integer not null default 1,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (kg_equivalent is null or kg_equivalent_origin is not null)
);

create table exchange_rate (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references project(id) on delete cascade,
  from_currency char(3) not null,
  to_currency   char(3) not null,
  rate          numeric(20,8) not null check (rate > 0),
  rate_date     date not null,
  source        text not null,
  version       integer not null default 1,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

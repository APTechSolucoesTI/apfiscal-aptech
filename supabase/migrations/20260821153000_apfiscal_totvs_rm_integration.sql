begin;
set local search_path = apfiscal, public, extensions;

alter table apfiscal.companies
  add column if not exists totvs_coligada_id integer check (totvs_coligada_id is null or totvs_coligada_id > 0);
create unique index if not exists companies_org_totvs_coligada_uidx
  on apfiscal.companies (organization_id, totvs_coligada_id)
  where totvs_coligada_id is not null;

alter table apfiscal.produtos
  add column if not exists erp_system text,
  add column if not exists erp_code text,
  add column if not exists erp_external_id text,
  add column if not exists erp_metadata jsonb not null default '{}'::jsonb,
  add column if not exists erp_synced_at timestamptz;
create unique index if not exists produtos_company_erp_external_uidx
  on apfiscal.produtos (company_id, erp_system, erp_external_id)
  where company_id is not null and erp_system is not null and erp_external_id is not null;

create table if not exists apfiscal.totvs_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references apfiscal.organizations(id) on delete cascade,
  enabled boolean not null default false,
  read_sync_enabled boolean not null default true,
  integration_enabled boolean not null default false,
  timezone text not null default 'America/Sao_Paulo',
  schedule_hours integer[] not null default array[6,8,12,16,20],
  safety_window_days integer not null default 3 check (safety_window_days between 1 and 30),
  last_connection_test_at timestamptz,
  last_connection_test_ok boolean,
  last_connection_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint totvs_schedule_hours_valid check (
    cardinality(schedule_hours) between 1 and 24
    and schedule_hours <@ array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]
  )
);

create table if not exists apfiscal.totvs_sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  entity text not null,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  source_watermark timestamptz,
  rows_processed bigint not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  unique (organization_id, entity)
);

create table if not exists apfiscal.totvs_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  direction text not null check (direction in ('rm_to_apfiscal','apfiscal_to_rm')),
  entity text,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','skipped')),
  trigger text not null default 'manual' check (trigger in ('manual','schedule','retry','system')),
  job_id text,
  started_at timestamptz,
  finished_at timestamptz,
  metrics jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references apfiscal.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists totvs_sync_runs_org_created_idx on apfiscal.totvs_sync_runs (organization_id, created_at desc);

create table if not exists apfiscal.totvs_reference_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  entity text not null,
  coligada_id integer not null default 0,
  external_key text not null,
  name text,
  active boolean not null default true,
  source_updated_at timestamptz,
  payload jsonb not null,
  payload_hash text not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity, coligada_id, external_key)
);
create index if not exists totvs_reference_records_lookup_idx
  on apfiscal.totvs_reference_records (organization_id, entity, active, name);

create table if not exists apfiscal.totvs_integration_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  company_id uuid not null references apfiscal.companies(id) on delete cascade,
  fiscal_document_id uuid not null references apfiscal.fiscal_documents(id) on delete cascade,
  idempotency_key text not null unique,
  status text not null default 'queued' check (status in ('queued','validating','running','succeeded','failed','blocked')),
  attempt integer not null default 0,
  job_id text,
  rm_record_id text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references apfiscal.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists totvs_integration_runs_document_idx
  on apfiscal.totvs_integration_runs (fiscal_document_id, created_at desc);

drop trigger if exists update_totvs_settings_updated_at on apfiscal.totvs_settings;
create trigger update_totvs_settings_updated_at before update on apfiscal.totvs_settings
  for each row execute function apfiscal.update_updated_at_column();
drop trigger if exists update_totvs_reference_records_updated_at on apfiscal.totvs_reference_records;
create trigger update_totvs_reference_records_updated_at before update on apfiscal.totvs_reference_records
  for each row execute function apfiscal.update_updated_at_column();
drop trigger if exists update_totvs_integration_runs_updated_at on apfiscal.totvs_integration_runs;
create trigger update_totvs_integration_runs_updated_at before update on apfiscal.totvs_integration_runs
  for each row execute function apfiscal.update_updated_at_column();

alter table apfiscal.totvs_settings enable row level security;
alter table apfiscal.totvs_sync_checkpoints enable row level security;
alter table apfiscal.totvs_sync_runs enable row level security;
alter table apfiscal.totvs_reference_records enable row level security;
alter table apfiscal.totvs_integration_runs enable row level security;

create policy "Members view TOTVS settings" on apfiscal.totvs_settings for select to authenticated
  using (apfiscal.is_org_member(organization_id));
create policy "Members view TOTVS checkpoints" on apfiscal.totvs_sync_checkpoints for select to authenticated
  using (apfiscal.is_org_member(organization_id));
create policy "Members view TOTVS sync runs" on apfiscal.totvs_sync_runs for select to authenticated
  using (apfiscal.is_org_member(organization_id));
create policy "Members view TOTVS references" on apfiscal.totvs_reference_records for select to authenticated
  using (apfiscal.is_org_member(organization_id));
create policy "Members view TOTVS integration runs" on apfiscal.totvs_integration_runs for select to authenticated
  using (apfiscal.is_org_member(organization_id));

grant select on apfiscal.totvs_settings, apfiscal.totvs_sync_checkpoints,
  apfiscal.totvs_sync_runs, apfiscal.totvs_reference_records, apfiscal.totvs_integration_runs to authenticated;
grant all on apfiscal.totvs_settings, apfiscal.totvs_sync_checkpoints,
  apfiscal.totvs_sync_runs, apfiscal.totvs_reference_records, apfiscal.totvs_integration_runs to service_role;

insert into apfiscal.permissions (key, module, action, description) values
  ('totvs.integration.view','TOTVS RM','view','Visualizar configuração, filas e execuções do TOTVS RM'),
  ('totvs.integration.manage','TOTVS RM','manage','Configurar conexão e sincronização do TOTVS RM'),
  ('totvs.integration.execute','TOTVS RM','execute','Executar sincronização e integração com o TOTVS RM')
on conflict (key) do update set module = excluded.module, action = excluded.action, description = excluded.description;

insert into apfiscal.profile_permissions (profile_id, permission_key)
select profile.id, permission.key
from apfiscal.access_profiles profile
cross join apfiscal.permissions permission
where profile.is_system = true and profile.name = 'Administrador' and permission.key like 'totvs.integration.%'
on conflict do nothing;

commit;

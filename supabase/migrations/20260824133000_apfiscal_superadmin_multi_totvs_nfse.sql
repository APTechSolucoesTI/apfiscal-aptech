begin;

set local search_path = apfiscal, public, extensions;

alter table apfiscal.users
  add column if not exists is_superadmin boolean not null default false,
  add column if not exists plan_key text not null default 'standard',
  add column if not exists max_companies integer check (max_companies is null or max_companies > 0),
  add column if not exists max_totvs_connections integer check (max_totvs_connections is null or max_totvs_connections > 0);
create index if not exists users_superadmin_idx on apfiscal.users (is_superadmin) where is_superadmin;

alter table apfiscal.companies
  add column if not exists totvs_connection_key text;
update apfiscal.companies
set totvs_connection_key = 'TOTVS_GRANJA'
where totvs_coligada_id is not null and totvs_connection_key is null;
alter table apfiscal.companies drop constraint if exists companies_totvs_connection_key_chk;
alter table apfiscal.companies add constraint companies_totvs_connection_key_chk
  check (totvs_connection_key is null or totvs_connection_key ~ '^[A-Z][A-Z0-9_]{1,63}$');
drop index if exists apfiscal.companies_org_totvs_coligada_uidx;
create unique index companies_org_totvs_connection_coligada_uidx
  on apfiscal.companies (organization_id, totvs_connection_key, totvs_coligada_id)
  where totvs_connection_key is not null and totvs_coligada_id is not null;

alter table apfiscal.totvs_settings
  add column if not exists default_connection_key text not null default 'TOTVS_GRANJA';

alter table apfiscal.totvs_sync_runs add column if not exists connection_key text;
alter table apfiscal.totvs_integration_runs add column if not exists connection_key text;
update apfiscal.totvs_sync_runs set connection_key = 'TOTVS_GRANJA' where connection_key is null;
update apfiscal.totvs_integration_runs run
set connection_key = coalesce(company.totvs_connection_key, 'TOTVS_GRANJA')
from apfiscal.companies company
where company.id = run.company_id and run.connection_key is null;
create index if not exists totvs_sync_runs_connection_idx
  on apfiscal.totvs_sync_runs (organization_id, connection_key, created_at desc);

alter table apfiscal.totvs_sync_checkpoints add column if not exists connection_key text;
update apfiscal.totvs_sync_checkpoints set connection_key = 'TOTVS_GRANJA' where connection_key is null;
alter table apfiscal.totvs_sync_checkpoints alter column connection_key set not null;
alter table apfiscal.totvs_sync_checkpoints alter column connection_key set default 'TOTVS_GRANJA';
alter table apfiscal.totvs_sync_checkpoints drop constraint if exists totvs_sync_checkpoints_organization_id_entity_key;
create unique index if not exists totvs_sync_checkpoints_connection_entity_uidx
  on apfiscal.totvs_sync_checkpoints (organization_id, connection_key, entity);

alter table apfiscal.totvs_reference_records add column if not exists connection_key text;
update apfiscal.totvs_reference_records set connection_key = 'TOTVS_GRANJA' where connection_key is null;
alter table apfiscal.totvs_reference_records alter column connection_key set not null;
alter table apfiscal.totvs_reference_records alter column connection_key set default 'TOTVS_GRANJA';
alter table apfiscal.totvs_reference_records drop constraint if exists totvs_reference_records_organization_id_entity_coligada_id__key;
create unique index if not exists totvs_reference_records_connection_uidx
  on apfiscal.totvs_reference_records (organization_id, connection_key, entity, coligada_id, external_key);

alter table apfiscal.empresa_integracoes_fiscais
  add column if not exists nfse_provider text not null default 'nacional_adn',
  add column if not exists nfse_automatic_sync_enabled boolean not null default false,
  add column if not exists nfse_sync_interval_minutes integer not null default 60,
  add column if not exists nfse_last_sync_at timestamptz,
  add column if not exists nfse_last_error text,
  add column if not exists nfse_last_nsu bigint not null default 0;
alter table apfiscal.empresa_integracoes_fiscais drop constraint if exists empresa_integracoes_fiscais_nfse_interval_chk;
alter table apfiscal.empresa_integracoes_fiscais add constraint empresa_integracoes_fiscais_nfse_interval_chk
  check (nfse_sync_interval_minutes between 15 and 1440);
alter table apfiscal.empresa_integracoes_fiscais drop constraint if exists empresa_integracoes_fiscais_nfse_provider_chk;
alter table apfiscal.empresa_integracoes_fiscais add constraint empresa_integracoes_fiscais_nfse_provider_chk
  check (nfse_provider in ('nacional_adn', 'sigiss', 'municipal'));

create table if not exists apfiscal.nfse_distribution_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  company_id uuid not null references apfiscal.companies(id) on delete cascade,
  provider text not null,
  nsu bigint not null,
  access_key text,
  content_type text,
  raw_document text not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  unique (company_id, provider, nsu)
);
create index if not exists nfse_distribution_documents_company_received_idx
  on apfiscal.nfse_distribution_documents (company_id, received_at desc);
alter table apfiscal.nfse_distribution_documents enable row level security;
create policy "Members view NFS-e distribution documents"
  on apfiscal.nfse_distribution_documents for select to authenticated
  using (apfiscal.is_org_member(organization_id) and apfiscal.user_can_access_company((select auth.uid()), company_id));
grant select on apfiscal.nfse_distribution_documents to authenticated;
grant all on apfiscal.nfse_distribution_documents to service_role;

create or replace function apfiscal.apply_totvs_company_mappings(
  _organization_id uuid,
  _mappings jsonb
)
returns void
language plpgsql
security invoker
set search_path = apfiscal, pg_temp
as $$
begin
  if jsonb_typeof(_mappings) is distinct from 'array' then
    raise exception 'Mapeamentos TOTVS inválidos.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_mappings) item
    group by item->>'companyId' having count(*) > 1
  ) then
    raise exception 'Uma empresa foi informada mais de uma vez.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_mappings) item
    where nullif(item->>'coligadaId', '') is not null
      and nullif(item->>'connectionKey', '') is not null
    group by item->>'connectionKey', (item->>'coligadaId')::integer
    having count(*) > 1
  ) then
    raise exception 'Cada par conexão/coligada pode ser associado a somente uma empresa.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_mappings) item
    left join apfiscal.companies company
      on company.id = (item->>'companyId')::uuid
     and company.organization_id = _organization_id
    where company.id is null
  ) then
    raise exception 'Uma empresa informada não pertence à organização.';
  end if;

  update apfiscal.companies
  set totvs_connection_key = null, totvs_coligada_id = null
  where organization_id = _organization_id;

  update apfiscal.companies company
  set totvs_connection_key = item.value->>'connectionKey',
      totvs_coligada_id = (item.value->>'coligadaId')::integer
  from jsonb_array_elements(_mappings) item(value)
  where company.organization_id = _organization_id
    and company.id = (item.value->>'companyId')::uuid
    and nullif(item.value->>'connectionKey', '') is not null
    and nullif(item.value->>'coligadaId', '') is not null;
end;
$$;
revoke all on function apfiscal.apply_totvs_company_mappings(uuid, jsonb) from public, anon, authenticated;
grant execute on function apfiscal.apply_totvs_company_mappings(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;

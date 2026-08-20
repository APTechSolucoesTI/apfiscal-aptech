-- Remodelação conservadora do domínio APFiscal.
-- ALTER ... SET SCHEMA preserva OIDs, dados, FKs, índices, triggers e policies.
create schema if not exists apfiscal;

do $$
declare
  object_name text;
  domain_tables constant text[] := array[
    'organizations','organization_members','companies','company_access','digital_certificates',
    'fiscal_documents','fiscal_document_items','fiscal_document_events','manifestations',
    'notifications','notification_settings','audit_logs','api_keys','suppliers','products',
    'familias','grupos','subgrupos','produtos','produtos_fornecedores','centros_custo',
    'plano_contas','nfe_centro_custo','nfe_item_centro_custo','empresa_integracoes_fiscais',
    'documentos_fiscais_integracao','historico_integracao_fiscal','locais_estoque',
    'nfe_status_historico','tipos_compra'
  ];
begin
  foreach object_name in array domain_tables loop
    if to_regclass(format('public.%I', object_name)) is not null
       and to_regclass(format('apfiscal.%I', object_name)) is null then
      execute format('alter table public.%I set schema apfiscal', object_name);
    end if;
  end loop;
end $$;

do $$
declare
  object_name text;
begin
  foreach object_name in array array['app_role','document_type','nfe_status','doc_integracao_status'] loop
    if exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = object_name
    ) and not exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'apfiscal' and t.typname = object_name
    ) then
      execute format('alter type public.%I set schema apfiscal', object_name);
    end if;
  end loop;
end $$;

-- Funções legadas seguem o domínio para que RPCs antigas continuem no mesmo schema das tabelas.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'update_updated_at_column','ensure_user_organization','is_org_member','has_org_role',
        'upsert_supplier_from_nfe','upsert_product_from_nfe','plano_contas_sync_permite_lanc',
        'check_item_cc_soma','check_doc_cc_soma','fn_log_nfe_status_change','fn_log_nfe_status_insert'
      ])
  loop
    execute format('alter function %s set schema apfiscal', fn.signature);
  end loop;
end $$;

-- Funções PL/pgSQL armazenam referências qualificadas como texto; reescreva-as
-- depois do SET SCHEMA para que continuem apontando ao mesmo domínio.
do $$
declare
  fn record;
  definition text;
begin
  for fn in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'apfiscal'
      and p.proname = any(array[
        'update_updated_at_column','ensure_user_organization','is_org_member','has_org_role',
        'upsert_supplier_from_nfe','upsert_product_from_nfe','plano_contas_sync_permite_lanc',
        'check_item_cc_soma','check_doc_cc_soma','fn_log_nfe_status_change','fn_log_nfe_status_insert'
      ])
  loop
    definition := replace(pg_get_functiondef(fn.oid), 'public.', 'apfiscal.');
    execute definition;
    execute format('alter function %s set search_path = apfiscal, public, pg_temp', fn.signature);
  end loop;
end $$;

create table if not exists apfiscal.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into apfiscal.users (id, email, full_name)
select auth_user.id, coalesce(auth_user.email, ''), coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name')
from auth.users auth_user
where auth_user.raw_user_meta_data ->> 'app' = 'apfiscal'
   or exists (select 1 from apfiscal.organization_members member where member.user_id = auth_user.id)
on conflict (id) do update set email = excluded.email;

create table if not exists apfiscal.permissions (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  module text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists apfiscal.access_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  description text,
  active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists access_profiles_org_name_uidx
  on apfiscal.access_profiles (organization_id, lower(name));

create table if not exists apfiscal.profile_permissions (
  profile_id uuid not null references apfiscal.access_profiles(id) on delete cascade,
  permission_key text not null references apfiscal.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, permission_key)
);

alter table apfiscal.organization_members
  add column if not exists profile_id uuid references apfiscal.access_profiles(id) on delete restrict,
  add column if not exists active boolean not null default true;
create unique index if not exists organization_members_org_user_uidx on apfiscal.organization_members(organization_id, user_id);
create unique index if not exists company_access_user_company_uidx on apfiscal.company_access(user_id, company_id);

insert into apfiscal.permissions (key, module, action, description) values
('dashboard.view','Dashboard','view','Visualizar dashboard e indicadores'),
('companies.view','Empresas','view','Visualizar empresas'),('companies.manage','Empresas','manage','Criar e editar empresas'),
('suppliers.view','Fornecedores','view','Visualizar fornecedores'),('suppliers.manage','Fornecedores','manage','Gerenciar fornecedores'),
('products.view','Produtos','view','Visualizar produtos'),('products.manage','Produtos','manage','Gerenciar produtos e vínculos'),
('classifications.view','Classificações','view','Visualizar classificações'),('classifications.manage','Classificações','manage','Gerenciar classificações'),
('documents.nfe.view','NF-e','view','Visualizar NF-e'),('documents.nfe.manage','NF-e','manage','Gerenciar NF-e'),
('documents.nfe.approve','NF-e','approve','Aprovar NF-e'),('documents.nfe.link_products','NF-e','link_products','Vincular produtos aos itens'),
('documents.nfse.view','NFS-e','view','Visualizar NFS-e'),('documents.nfse.manage','NFS-e','manage','Gerenciar NFS-e'),
('documents.cte.view','CT-e','view','Visualizar CT-e'),('documents.cte.manage','CT-e','manage','Gerenciar CT-e'),
('nfe.integration.view','Integração NF-e','view','Visualizar integração fiscal'),('nfe.integration.manage','Integração NF-e','manage','Configurar e executar integração fiscal'),
('monitoring.view','Monitoramento','view','Visualizar monitoramento'),
('notifications.view','Notificações','view','Visualizar notificações'),('notifications.manage','Notificações','manage','Gerenciar notificações'),
('finance.cost_centers.view','Centros de custo','view','Visualizar centros de custo'),('finance.cost_centers.manage','Centros de custo','manage','Gerenciar centros de custo e rateios'),
('finance.chart_accounts.view','Plano de contas','view','Visualizar plano de contas'),('finance.chart_accounts.manage','Plano de contas','manage','Gerenciar plano de contas'),
('finance.stock_locations.view','Locais de estoque','view','Visualizar locais de estoque'),('finance.stock_locations.manage','Locais de estoque','manage','Gerenciar locais de estoque'),
('settings.general.view','Configurações','view','Visualizar configurações'),('settings.general.manage','Configurações','manage','Gerenciar configurações'),
('settings.users.view','Usuários','view','Visualizar usuários'),('settings.users.manage','Usuários','manage','Convidar e gerenciar usuários'),
('settings.profiles.view','Perfis','view','Visualizar perfis de acesso'),('settings.profiles.manage','Perfis','manage','Gerenciar perfis e permissões'),
('settings.api_keys.view','API Keys','view','Visualizar API keys'),('settings.api_keys.manage','API Keys','manage','Gerenciar API keys')
on conflict (key) do update set module = excluded.module, action = excluded.action, description = excluded.description;

insert into apfiscal.access_profiles (organization_id, name, description, active, is_system)
select o.id, 'Administrador', 'Acesso completo à organização.', true, true
from apfiscal.organizations o
on conflict (organization_id, (lower(name))) do update set active = true, is_system = true;

insert into apfiscal.profile_permissions (profile_id, permission_key)
select p.id, permission.key
from apfiscal.access_profiles p cross join apfiscal.permissions permission
where p.name = 'Administrador'
on conflict do nothing;

update apfiscal.organization_members member
set profile_id = profile.id
from apfiscal.access_profiles profile
where profile.organization_id = member.organization_id
  and profile.name = 'Administrador'
  and member.role = 'admin'
  and member.profile_id is null;

-- Configuração canônica de provider e checkpoint único por empresa/CNPJ.
alter table apfiscal.empresa_integracoes_fiscais
  add column if not exists primary_provider text not null default 'nfewizard' check (primary_provider in ('nfewizard','apifiscal')),
  add column if not exists fallback_provider text default 'apifiscal' check (fallback_provider is null or fallback_provider in ('nfewizard','apifiscal')),
  add column if not exists fallback_enabled boolean not null default true,
  add column if not exists certificate_storage_path text,
  add column if not exists certificate_password_encrypted text,
  add column if not exists certificate_expires_at timestamptz,
  add column if not exists apifiscal_certificate_configured boolean not null default false,
  add column if not exists apifiscal_certificate_last_error text,
  add column if not exists apifiscal_certificate_updated_at timestamptz;

update apfiscal.empresa_integracoes_fiscais
set apifiscal_certificate_configured = true
where api_key_encrypted is not null;

create table if not exists apfiscal.fiscal_distribution_state (
  company_id uuid primary key references apfiscal.companies(id) on delete cascade,
  cnpj text not null,
  last_nsu bigint not null default 0 check (last_nsu >= 0),
  last_sync_at timestamptz,
  next_allowed_sync_at timestamptz,
  last_cstat text,
  last_error text,
  locked_at timestamptz,
  locked_by uuid,
  lock_token uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists fiscal_distribution_state_cnpj_uidx on apfiscal.fiscal_distribution_state(cnpj);

insert into apfiscal.fiscal_distribution_state (company_id, cnpj, last_nsu)
select company.id, regexp_replace(company.cnpj, '\D', '', 'g'), coalesce(integration.ultimo_nsu, 0)
from apfiscal.companies company
left join apfiscal.empresa_integracoes_fiscais integration on integration.company_id = company.id
on conflict (company_id) do update set
  cnpj = excluded.cnpj,
  last_nsu = greatest(apfiscal.fiscal_distribution_state.last_nsu, excluded.last_nsu);

alter table apfiscal.fiscal_documents
  add column if not exists source_provider text check (source_provider is null or source_provider in ('nfewizard','apifiscal','manual'));
create unique index if not exists fiscal_documents_company_chave_uidx
  on apfiscal.fiscal_documents(company_id, chave_acesso)
  where chave_acesso is not null and length(chave_acesso) > 0;

alter table apfiscal.manifestations
  add column if not exists provider text check (provider is null or provider in ('nfewizard','apifiscal')),
  add column if not exists sequence integer not null default 1,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists response_cstat text,
  add column if not exists response_xmotivo text;
create unique index if not exists manifestations_idempotency_uidx
  on apfiscal.manifestations(fiscal_document_id, tipo, sequence);

alter table apfiscal.audit_logs
  add column if not exists details jsonb not null default '{}'::jsonb;

-- Bucket privado: XML nunca é público e o browser não recebe acesso direto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiscal-xml',
  'fiscal-xml',
  false,
  10485760,
  array['application/xml','text/xml','application/zip','application/x-pkcs12','application/pkcs12','application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function apfiscal.sync_auth_user()
returns trigger language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'apfiscal'
     and not exists (select 1 from apfiscal.users app_user where app_user.id = new.id) then
    return new;
  end if;
  insert into apfiscal.users (id, email, full_name, active)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), true)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end $$;
revoke all on function apfiscal.sync_auth_user() from public, anon, authenticated;

drop trigger if exists apfiscal_sync_auth_user on auth.users;
create trigger apfiscal_sync_auth_user after insert or update of email on auth.users
for each row execute function apfiscal.sync_auth_user();

create or replace function apfiscal.ensure_admin_profile()
returns trigger language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
declare profile_id uuid;
begin
  insert into apfiscal.access_profiles (organization_id, name, description, is_system)
  values (new.id, 'Administrador', 'Acesso completo à organização.', true)
  on conflict (organization_id, (lower(name))) do update set active = true
  returning id into profile_id;
  insert into apfiscal.profile_permissions (profile_id, permission_key)
  select profile_id, key from apfiscal.permissions on conflict do nothing;
  return new;
end $$;
revoke all on function apfiscal.ensure_admin_profile() from public, anon, authenticated;

drop trigger if exists apfiscal_ensure_admin_profile on apfiscal.organizations;
create trigger apfiscal_ensure_admin_profile after insert on apfiscal.organizations
for each row execute function apfiscal.ensure_admin_profile();

create or replace function apfiscal.assign_admin_profile_to_creator()
returns trigger language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
begin
  insert into apfiscal.users (id, email)
  select auth_user.id, coalesce(auth_user.email, '') from auth.users auth_user where auth_user.id = new.user_id
  on conflict (id) do nothing;
  if new.role = 'admin' and new.profile_id is null then
    select id into new.profile_id from apfiscal.access_profiles
    where organization_id = new.organization_id and name = 'Administrador';
  end if;
  return new;
end $$;
revoke all on function apfiscal.assign_admin_profile_to_creator() from public, anon, authenticated;

drop trigger if exists apfiscal_assign_admin_profile on apfiscal.organization_members;
create trigger apfiscal_assign_admin_profile before insert or update of role on apfiscal.organization_members
for each row execute function apfiscal.assign_admin_profile_to_creator();

create or replace function apfiscal.user_has_permission(_user_id uuid, _permission text)
returns boolean language sql stable security definer
set search_path = apfiscal, pg_temp
as $$
  select exists (
    select 1 from apfiscal.organization_members member
    join apfiscal.access_profiles profile on profile.id = member.profile_id and profile.active
    join apfiscal.profile_permissions profile_permission on profile_permission.profile_id = profile.id
    where member.user_id = _user_id and member.active and profile_permission.permission_key = _permission
  )
$$;
revoke all on function apfiscal.user_has_permission(uuid,text) from public, anon, authenticated;
grant execute on function apfiscal.user_has_permission(uuid,text) to service_role;

create or replace function apfiscal.list_user_permissions(_user_id uuid)
returns table(permission_key text) language sql stable security definer
set search_path = apfiscal, pg_temp
as $$
  select distinct pp.permission_key
  from apfiscal.organization_members member
  join apfiscal.access_profiles profile on profile.id = member.profile_id and profile.active
  join apfiscal.profile_permissions pp on pp.profile_id = profile.id
  where member.user_id = _user_id and member.active
$$;
revoke all on function apfiscal.list_user_permissions(uuid) from public, anon, authenticated;
grant execute on function apfiscal.list_user_permissions(uuid) to service_role;

create or replace function apfiscal.user_can_access_company(_user_id uuid, _company_id uuid)
returns boolean language sql stable security definer
set search_path = apfiscal, pg_temp
as $$
  select exists (
    select 1 from apfiscal.companies company
    join apfiscal.organization_members member on member.organization_id = company.organization_id
    where company.id = _company_id and member.user_id = _user_id and member.active
      and (
        not exists (select 1 from apfiscal.company_access access where access.user_id = _user_id)
        or exists (select 1 from apfiscal.company_access access where access.user_id = _user_id and access.company_id = _company_id)
      )
  )
$$;
revoke all on function apfiscal.user_can_access_company(uuid,uuid) from public, anon, authenticated;
grant execute on function apfiscal.user_can_access_company(uuid,uuid) to service_role;

create or replace function apfiscal.try_acquire_fiscal_sync_lock(_company_id uuid, _worker_id uuid, _ttl interval default interval '15 minutes')
returns uuid language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
declare token uuid := gen_random_uuid();
begin
  update apfiscal.fiscal_distribution_state
  set locked_at = now(), locked_by = _worker_id, lock_token = token, updated_at = now()
  where company_id = _company_id
    and (locked_at is null or locked_at < now() - _ttl);
  if not found then return null; end if;
  return token;
end $$;
revoke all on function apfiscal.try_acquire_fiscal_sync_lock(uuid,uuid,interval) from public, anon, authenticated;
grant execute on function apfiscal.try_acquire_fiscal_sync_lock(uuid,uuid,interval) to service_role;

create or replace function apfiscal.release_fiscal_sync_lock(_company_id uuid, _lock_token uuid)
returns void language sql security definer
set search_path = apfiscal, pg_temp
as $$
  update apfiscal.fiscal_distribution_state set locked_at = null, locked_by = null, lock_token = null, updated_at = now()
  where company_id = _company_id and lock_token = _lock_token
$$;
revoke all on function apfiscal.release_fiscal_sync_lock(uuid,uuid) from public, anon, authenticated;
grant execute on function apfiscal.release_fiscal_sync_lock(uuid,uuid) to service_role;

alter table apfiscal.users enable row level security;
alter table apfiscal.access_profiles enable row level security;
alter table apfiscal.permissions enable row level security;
alter table apfiscal.profile_permissions enable row level security;
alter table apfiscal.fiscal_distribution_state enable row level security;

drop policy if exists users_select_same_org on apfiscal.users;
create policy users_select_same_org on apfiscal.users for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from apfiscal.organization_members mine
    join apfiscal.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = users.id and mine.active
  )
);
drop policy if exists permissions_read_authenticated on apfiscal.permissions;
create policy permissions_read_authenticated on apfiscal.permissions for select to authenticated using (true);
drop policy if exists profiles_read_org on apfiscal.access_profiles;
create policy profiles_read_org on apfiscal.access_profiles for select to authenticated using (
  exists (select 1 from apfiscal.organization_members member where member.organization_id = access_profiles.organization_id and member.user_id = (select auth.uid()) and member.active)
);
drop policy if exists profile_permissions_read_org on apfiscal.profile_permissions;
create policy profile_permissions_read_org on apfiscal.profile_permissions for select to authenticated using (
  exists (select 1 from apfiscal.access_profiles profile join apfiscal.organization_members member on member.organization_id = profile.organization_id where profile.id = profile_permissions.profile_id and member.user_id = (select auth.uid()) and member.active)
);
drop policy if exists distribution_state_read_org on apfiscal.fiscal_distribution_state;
create policy distribution_state_read_org on apfiscal.fiscal_distribution_state for select to authenticated using (
  exists (select 1 from apfiscal.companies company join apfiscal.organization_members member on member.organization_id = company.organization_id where company.id = fiscal_distribution_state.company_id and member.user_id = (select auth.uid()) and member.active)
);

grant usage on schema apfiscal to authenticated, service_role;
grant select, insert, update, delete on all tables in schema apfiscal to authenticated;
grant all on all tables in schema apfiscal to service_role;
grant usage, select on all sequences in schema apfiscal to authenticated, service_role;
alter default privileges in schema apfiscal grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema apfiscal grant all on tables to service_role;

-- Adiciona o schema sem remover outros schemas já expostos na instância.
do $$
declare configured text := coalesce(current_setting('pgrst.db_schemas', true), 'public,storage,graphql_public');
begin
  if configured !~ '(^|,)\s*apfiscal\s*(,|$)' then
    execute format('alter role authenticator set pgrst.db_schemas = %L', configured || ',apfiscal');
  end if;
exception when insufficient_privilege then
  raise notice 'Configure apfiscal nos schemas expostos do Data API';
end $$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

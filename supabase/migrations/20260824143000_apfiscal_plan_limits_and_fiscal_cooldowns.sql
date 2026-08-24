begin;

set local search_path = apfiscal, public, extensions;

create table if not exists apfiscal.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_-]{1,39}$'),
  name text not null,
  description text,
  price_label text,
  active boolean not null default true,
  highlighted boolean not null default false,
  max_users integer check (max_users is null or max_users > 0),
  max_companies integer check (max_companies is null or max_companies > 0),
  max_monthly_documents integer check (max_monthly_documents is null or max_monthly_documents > 0),
  max_totvs_connections integer check (max_totvs_connections is null or max_totvs_connections > 0),
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into apfiscal.subscription_plans
  (key, name, description, price_label, highlighted, max_users, max_companies, max_monthly_documents, max_totvs_connections, features, sort_order)
values
  ('starter', 'Starter', 'Para pequenas empresas que precisam do controle fiscal essencial.', 'R$ 99/mês', false, 3, 2, 100, 1,
   '{"automatic_nfe":true,"automatic_nfse":false,"automatic_manifestation":false,"api_integration":false,"advanced_dashboards":false,"totvs_integration":false}'::jsonb, 10),
  ('pro', 'Pro', 'Automação fiscal para empresas em crescimento.', 'R$ 249/mês', true, 10, 10, 1000, 2,
   '{"automatic_nfe":true,"automatic_nfse":true,"automatic_manifestation":true,"api_integration":false,"advanced_dashboards":true,"totvs_integration":true}'::jsonb, 20),
  ('enterprise', 'Enterprise', 'Limites personalizados, integrações e operação em escala.', 'Sob consulta', false, null, null, null, null,
   '{"automatic_nfe":true,"automatic_nfse":true,"automatic_manifestation":true,"api_integration":true,"advanced_dashboards":true,"totvs_integration":true}'::jsonb, 30)
on conflict (key) do nothing;

alter table apfiscal.organizations
  add column if not exists plan_key text,
  add column if not exists max_users_override integer check (max_users_override is null or max_users_override > 0),
  add column if not exists max_companies_override integer check (max_companies_override is null or max_companies_override > 0),
  add column if not exists max_monthly_documents_override integer check (max_monthly_documents_override is null or max_monthly_documents_override > 0),
  add column if not exists max_totvs_connections_override integer check (max_totvs_connections_override is null or max_totvs_connections_override > 0);

-- Preserve current accounts without introducing a surprise restriction.
update apfiscal.organizations set plan_key = 'enterprise' where plan_key is null;
alter table apfiscal.organizations alter column plan_key set default 'starter';
alter table apfiscal.organizations alter column plan_key set not null;
alter table apfiscal.organizations drop constraint if exists organizations_plan_key_fkey;
alter table apfiscal.organizations add constraint organizations_plan_key_fkey
  foreign key (plan_key) references apfiscal.subscription_plans(key);

alter table apfiscal.empresa_integracoes_fiscais
  add column if not exists nfse_next_allowed_sync_at timestamptz;

create or replace function apfiscal.enforce_company_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = apfiscal, pg_temp
as $$
declare
  allowed integer;
  current_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));
  select coalesce(org.max_companies_override, plan.max_companies)
    into allowed
  from apfiscal.organizations org
  join apfiscal.subscription_plans plan on plan.key = org.plan_key
  where org.id = new.organization_id;

  if allowed is null then return new; end if;
  select count(*) into current_count from apfiscal.companies where organization_id = new.organization_id;
  if current_count >= allowed then
    raise exception using
      errcode = 'P0001',
      message = format('Limite de empresas atingido: este plano permite %s empresa(s). Ajuste o plano ou o limite da conta no Super Admin.', allowed);
  end if;
  return new;
end;
$$;
revoke all on function apfiscal.enforce_company_plan_limit() from public, anon, authenticated;

drop trigger if exists companies_plan_limit_before_insert on apfiscal.companies;
create trigger companies_plan_limit_before_insert
before insert on apfiscal.companies
for each row execute function apfiscal.enforce_company_plan_limit();

create or replace function apfiscal.enforce_monthly_document_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = apfiscal, pg_temp
as $$
declare
  organization_id_value uuid;
  allowed integer;
  current_count integer;
begin
  -- Idempotent upserts/imports of an existing key must remain available.
  if exists (select 1 from apfiscal.fiscal_documents where company_id = new.company_id and chave_acesso = new.chave_acesso) then
    return new;
  end if;
  select company.organization_id, coalesce(org.max_monthly_documents_override, plan.max_monthly_documents)
    into organization_id_value, allowed
  from apfiscal.companies company
  join apfiscal.organizations org on org.id = company.organization_id
  join apfiscal.subscription_plans plan on plan.key = org.plan_key
  where company.id = new.company_id;
  perform pg_advisory_xact_lock(hashtextextended(organization_id_value::text, 1));
  if allowed is null then return new; end if;
  select count(*) into current_count
  from apfiscal.fiscal_documents document
  join apfiscal.companies company on company.id = document.company_id
  where company.organization_id = organization_id_value
    and document.created_at >= date_trunc('month', now())
    and document.created_at < date_trunc('month', now()) + interval '1 month';
  if current_count >= allowed then
    raise exception using
      errcode = 'P0001',
      message = format('Limite mensal atingido: o plano permite %s documento(s) por mês. Documentos já importados continuam disponíveis; novos documentos serão liberados no primeiro dia do próximo mês ou após ajuste do plano.', allowed);
  end if;
  return new;
end;
$$;
revoke all on function apfiscal.enforce_monthly_document_plan_limit() from public, anon, authenticated;
drop trigger if exists fiscal_documents_plan_limit_before_insert on apfiscal.fiscal_documents;
create trigger fiscal_documents_plan_limit_before_insert
before insert on apfiscal.fiscal_documents
for each row execute function apfiscal.enforce_monthly_document_plan_limit();

alter table apfiscal.subscription_plans enable row level security;
revoke all on apfiscal.subscription_plans from anon, authenticated;
grant all on apfiscal.subscription_plans to service_role;
grant execute on function apfiscal.enforce_company_plan_limit() to service_role;
grant execute on function apfiscal.enforce_monthly_document_plan_limit() to service_role;

notify pgrst, 'reload schema';
commit;

begin;

set local search_path = apfiscal, public, extensions;

alter table apfiscal.organizations
  add column if not exists totvs_structure_mode text not null default 'COLIGADA',
  add column if not exists totvs_main_coligada_id integer;

alter table apfiscal.organizations
  drop constraint if exists organizations_totvs_structure_mode_chk,
  drop constraint if exists organizations_totvs_main_coligada_chk;
alter table apfiscal.organizations
  add constraint organizations_totvs_structure_mode_chk
    check (totvs_structure_mode in ('COLIGADA', 'FILIAL')),
  add constraint organizations_totvs_main_coligada_chk
    check (
      (totvs_structure_mode = 'COLIGADA' and totvs_main_coligada_id is null)
      or
      (totvs_structure_mode = 'FILIAL' and totvs_main_coligada_id > 0)
    );

alter table apfiscal.companies
  add column if not exists totvs_filial_id integer;
alter table apfiscal.companies
  drop constraint if exists companies_totvs_filial_id_chk;
alter table apfiscal.companies
  add constraint companies_totvs_filial_id_chk
    check (totvs_filial_id is null or totvs_filial_id > 0);

-- O índice anterior representava a premissa "uma empresa = uma coligada".
-- A validação abaixo preserva essa regra no modo COLIGADA e permite várias
-- filiais da mesma coligada no modo FILIAL.
drop index if exists apfiscal.companies_org_totvs_connection_coligada_uidx;
create index if not exists companies_totvs_scope_idx
  on apfiscal.companies (
    organization_id,
    totvs_connection_key,
    totvs_coligada_id,
    totvs_filial_id
  );

create or replace function apfiscal.validate_company_totvs_scope()
returns trigger
language plpgsql
security invoker
set search_path = apfiscal, pg_temp
as $$
declare
  structure_mode text;
begin
  select organization.totvs_structure_mode
    into structure_mode
    from apfiscal.organizations organization
   where organization.id = new.organization_id;

  if structure_mode = 'FILIAL' then
    if new.totvs_coligada_id is not null then
      raise exception 'No modo Por Filial, a coligada pertence à conta e não deve ser repetida na empresa.';
    end if;
    if (new.totvs_connection_key is null) <> (new.totvs_filial_id is null) then
      raise exception 'Informe conexão e filial TOTVS juntas.';
    end if;
    if new.totvs_filial_id is not null and exists (
      select 1
        from apfiscal.companies company
       where company.organization_id = new.organization_id
         and company.id <> new.id
         and company.totvs_connection_key = new.totvs_connection_key
         and company.totvs_filial_id = new.totvs_filial_id
    ) then
      raise exception 'Cada par conexão/filial pode ser associado a somente uma empresa.';
    end if;
  else
    if new.totvs_filial_id is not null then
      raise exception 'Filial TOTVS somente pode ser usada em contas estruturadas por filial.';
    end if;
    if (new.totvs_connection_key is null) <> (new.totvs_coligada_id is null) then
      raise exception 'Informe conexão e coligada TOTVS juntas.';
    end if;
    if new.totvs_coligada_id is not null and exists (
      select 1
        from apfiscal.companies company
       where company.organization_id = new.organization_id
         and company.id <> new.id
         and company.totvs_connection_key = new.totvs_connection_key
         and company.totvs_coligada_id = new.totvs_coligada_id
    ) then
      raise exception 'Cada par conexão/coligada pode ser associado a somente uma empresa.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_company_totvs_scope on apfiscal.companies;
create trigger validate_company_totvs_scope
  before insert or update of organization_id, totvs_connection_key, totvs_coligada_id, totvs_filial_id
  on apfiscal.companies
  for each row execute function apfiscal.validate_company_totvs_scope();

alter table apfiscal.totvs_reference_records
  add column if not exists filial_id integer not null default 0;
alter table apfiscal.totvs_reference_records
  drop constraint if exists totvs_reference_records_filial_id_chk;
alter table apfiscal.totvs_reference_records
  add constraint totvs_reference_records_filial_id_chk check (filial_id >= 0);
drop index if exists apfiscal.totvs_reference_records_connection_uidx;
create unique index totvs_reference_records_scope_uidx
  on apfiscal.totvs_reference_records (
    organization_id,
    connection_key,
    entity,
    coligada_id,
    filial_id,
    external_key
  );
create index if not exists totvs_reference_records_filial_lookup_idx
  on apfiscal.totvs_reference_records (
    organization_id,
    connection_key,
    entity,
    coligada_id,
    filial_id,
    active
  );

create or replace function apfiscal.configure_totvs_structure(
  _organization_id uuid,
  _mode text,
  _main_coligada_id integer default null
)
returns void
language plpgsql
security invoker
set search_path = apfiscal, pg_temp
as $$
begin
  if _mode not in ('COLIGADA', 'FILIAL') then
    raise exception 'Estrutura TOTVS inválida.';
  end if;
  if _mode = 'FILIAL' and coalesce(_main_coligada_id, 0) <= 0 then
    raise exception 'Informe a coligada principal para usar o modo Por Filial.';
  end if;

  update apfiscal.organizations
     set totvs_structure_mode = _mode,
         totvs_main_coligada_id = case when _mode = 'FILIAL' then _main_coligada_id else null end
   where id = _organization_id;
  if not found then raise exception 'Conta não encontrada.'; end if;

  if _mode = 'FILIAL' then
    update apfiscal.companies
       set totvs_connection_key = null,
           totvs_coligada_id = null,
           totvs_filial_id = null
     where organization_id = _organization_id;
  else
    update apfiscal.companies
       set totvs_connection_key = null,
           totvs_filial_id = null,
           totvs_coligada_id = null
     where organization_id = _organization_id;
  end if;
end;
$$;

create or replace function apfiscal.apply_totvs_company_mappings(
  _organization_id uuid,
  _mappings jsonb
)
returns void
language plpgsql
security invoker
set search_path = apfiscal, pg_temp
as $$
declare
  structure_mode text;
begin
  if jsonb_typeof(_mappings) is distinct from 'array' then
    raise exception 'Mapeamentos TOTVS inválidos.';
  end if;

  select organization.totvs_structure_mode
    into structure_mode
    from apfiscal.organizations organization
   where organization.id = _organization_id;
  if structure_mode is null then raise exception 'Conta não encontrada.'; end if;

  if exists (
    select 1 from jsonb_array_elements(_mappings) item
    group by item->>'companyId' having count(*) > 1
  ) then
    raise exception 'Uma empresa foi informada mais de uma vez.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(_mappings) item
    left join apfiscal.companies company
      on company.id = (item->>'companyId')::uuid
     and company.organization_id = _organization_id
    where company.id is null
  ) then
    raise exception 'Uma empresa informada não pertence à conta.';
  end if;

  if structure_mode = 'FILIAL' then
    if exists (
      select 1 from jsonb_array_elements(_mappings) item
      where nullif(item->>'connectionKey', '') is not null
        and nullif(item->>'filialId', '') is not null
      group by item->>'connectionKey', (item->>'filialId')::integer
      having count(*) > 1
    ) then
      raise exception 'Cada par conexão/filial pode ser associado a somente uma empresa.';
    end if;
  elsif exists (
    select 1 from jsonb_array_elements(_mappings) item
    where nullif(item->>'connectionKey', '') is not null
      and nullif(item->>'coligadaId', '') is not null
    group by item->>'connectionKey', (item->>'coligadaId')::integer
    having count(*) > 1
  ) then
    raise exception 'Cada par conexão/coligada pode ser associado a somente uma empresa.';
  end if;

  update apfiscal.companies
     set totvs_connection_key = null,
         totvs_coligada_id = null,
         totvs_filial_id = null
   where organization_id = _organization_id;

  if structure_mode = 'FILIAL' then
    update apfiscal.companies company
       set totvs_connection_key = item.value->>'connectionKey',
           totvs_filial_id = (item.value->>'filialId')::integer
      from jsonb_array_elements(_mappings) item(value)
     where company.organization_id = _organization_id
       and company.id = (item.value->>'companyId')::uuid
       and nullif(item.value->>'connectionKey', '') is not null
       and nullif(item.value->>'filialId', '') is not null;
  else
    update apfiscal.companies company
       set totvs_connection_key = item.value->>'connectionKey',
           totvs_coligada_id = (item.value->>'coligadaId')::integer
      from jsonb_array_elements(_mappings) item(value)
     where company.organization_id = _organization_id
       and company.id = (item.value->>'companyId')::uuid
       and nullif(item.value->>'connectionKey', '') is not null
       and nullif(item.value->>'coligadaId', '') is not null;
  end if;
end;
$$;

revoke all on function apfiscal.configure_totvs_structure(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function apfiscal.configure_totvs_structure(uuid, text, integer)
  to service_role;
revoke all on function apfiscal.apply_totvs_company_mappings(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function apfiscal.apply_totvs_company_mappings(uuid, jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;

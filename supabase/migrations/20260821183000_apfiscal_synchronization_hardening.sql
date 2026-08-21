begin;
set local search_path = apfiscal, public, extensions;

alter table apfiscal.centros_custo drop constraint if exists centros_custo_codigo_formato;
alter table apfiscal.centros_custo
  add constraint centros_custo_codigo_formato
  check (codigo = btrim(codigo) and length(codigo) between 1 and 50);

alter table apfiscal.locais_estoque drop constraint if exists locais_estoque_codigo_formato;
alter table apfiscal.locais_estoque
  add constraint locais_estoque_codigo_formato
  check (codigo = btrim(codigo) and length(codigo) between 1 and 50);

alter table apfiscal.empresa_integracoes_fiscais
  add column if not exists automatic_sync_enabled boolean not null default false,
  add column if not exists sync_interval_minutes integer not null default 60,
  add constraint empresa_integracoes_fiscais_sync_interval_chk
    check (sync_interval_minutes between 15 and 1440);

alter table apfiscal.totvs_sync_runs drop constraint if exists totvs_sync_runs_status_check;
alter table apfiscal.totvs_sync_runs
  add constraint totvs_sync_runs_status_check
  check (status in ('queued','running','succeeded','partial','failed','skipped'));

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
    select 1
    from jsonb_array_elements(_mappings) item
    group by item->>'companyId'
    having count(*) > 1
  ) then
    raise exception 'Uma empresa foi informada mais de uma vez.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_mappings) item
    where nullif(item->>'coligadaId', '') is not null
    group by (item->>'coligadaId')::integer
    having count(*) > 1
  ) then
    raise exception 'Cada coligada TOTVS pode ser associada a somente uma empresa.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(_mappings) item
    left join apfiscal.companies company
      on company.id = (item->>'companyId')::uuid
     and company.organization_id = _organization_id
    where company.id is null
  ) then
    raise exception 'Uma empresa informada não pertence à organização.';
  end if;

  -- A limpeza e a nova associação acontecem na mesma transação, permitindo
  -- trocar duas coligadas entre empresas sem colisão temporária no índice único.
  update apfiscal.companies
  set totvs_coligada_id = null
  where organization_id = _organization_id;

  update apfiscal.companies company
  set totvs_coligada_id = (item.value->>'coligadaId')::integer
  from jsonb_array_elements(_mappings) item(value)
  where company.organization_id = _organization_id
    and company.id = (item.value->>'companyId')::uuid
    and nullif(item.value->>'coligadaId', '') is not null;
end;
$$;

revoke all on function apfiscal.apply_totvs_company_mappings(uuid, jsonb) from public, anon, authenticated;
grant execute on function apfiscal.apply_totvs_company_mappings(uuid, jsonb) to service_role;

commit;

begin;

create or replace function apfiscal.upsert_supplier_from_nfe(
  _organization_id uuid,
  _company_id uuid,
  _cnpj text,
  _razao_social text,
  _nome_fantasia text default null,
  _ie text default null,
  _endereco jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = apfiscal, public, pg_temp
as $$
declare
  supplier_id uuid;
begin
  if auth.uid() is not null then
    if not exists (
      select 1
      from apfiscal.organization_members member
      where member.organization_id = _organization_id
        and member.user_id = auth.uid()
        and member.active
    ) then
      raise insufficient_privilege using message = 'Usuário não pertence à organização informada.';
    end if;

    if not exists (
      select 1
      from apfiscal.companies company
      where company.id = _company_id
        and company.organization_id = _organization_id
    ) then
      raise insufficient_privilege using message = 'Empresa não pertence à organização informada.';
    end if;
  end if;

  insert into apfiscal.suppliers (
    organization_id,
    company_id,
    cnpj_cpf,
    razao_social,
    nome_fantasia,
    inscricao_estadual,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    municipio,
    uf,
    origem
  ) values (
    _organization_id,
    _company_id,
    _cnpj,
    _razao_social,
    _nome_fantasia,
    _ie,
    _endereco ->> 'cep',
    _endereco ->> 'logradouro',
    _endereco ->> 'numero',
    _endereco ->> 'complemento',
    _endereco ->> 'bairro',
    _endereco ->> 'municipio',
    _endereco ->> 'uf',
    'auto_nfe'
  )
  on conflict (company_id, cnpj_cpf) do update set
    razao_social = excluded.razao_social,
    nome_fantasia = coalesce(excluded.nome_fantasia, apfiscal.suppliers.nome_fantasia),
    updated_at = now()
  returning id into supplier_id;

  return supplier_id;
end
$$;

-- SECURITY DEFINER nasce executável por PUBLIC. Remova a herança ampla e
-- conceda apenas as RPCs efetivamente usadas por cada papel.
do $$
declare
  function_record record;
begin
  for function_record in
    select procedure.oid::regprocedure as signature
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'apfiscal'
      and procedure.prosecdef
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      function_record.signature
    );
  end loop;
end
$$;

grant execute on function apfiscal.ensure_user_organization() to authenticated;
grant execute on function apfiscal.is_org_member(uuid) to authenticated, service_role;
grant execute on function apfiscal.has_org_role(uuid, apfiscal.app_role[]) to authenticated, service_role;
grant execute on function apfiscal.upsert_supplier_from_nfe(uuid, uuid, text, text, text, text, jsonb) to authenticated, service_role;

grant execute on function apfiscal.user_has_permission(uuid, text) to service_role;
grant execute on function apfiscal.list_user_permissions(uuid) to service_role;
grant execute on function apfiscal.user_can_access_company(uuid, uuid) to service_role;
grant execute on function apfiscal.try_acquire_fiscal_sync_lock(uuid, uuid, interval) to service_role;
grant execute on function apfiscal.release_fiscal_sync_lock(uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;

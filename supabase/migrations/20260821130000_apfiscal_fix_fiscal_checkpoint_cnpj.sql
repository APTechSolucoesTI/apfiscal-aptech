-- Corrige a expressão regular da migration anterior sem reescrever histórico
-- já aplicado. O checkpoint deve armazenar somente os 14 dígitos do CNPJ.
begin;
set local search_path = apfiscal, public, extensions;

create or replace function apfiscal.initialize_company_fiscal_integration()
returns trigger
language plpgsql
security definer
set search_path = apfiscal, pg_temp
as $$
begin
  insert into apfiscal.empresa_integracoes_fiscais (organization_id, company_id)
  values (new.organization_id, new.id)
  on conflict (company_id) do nothing;

  insert into apfiscal.fiscal_distribution_state (company_id, cnpj)
  values (new.id, regexp_replace(new.cnpj, '\D', '', 'g'))
  on conflict (company_id) do update
    set cnpj = excluded.cnpj,
        updated_at = now();

  return new;
end;
$$;

revoke all on function apfiscal.initialize_company_fiscal_integration() from public, anon, authenticated;

update apfiscal.fiscal_distribution_state state
set cnpj = regexp_replace(company.cnpj, '\D', '', 'g'),
    updated_at = now()
from apfiscal.companies company
where company.id = state.company_id
  and state.cnpj is distinct from regexp_replace(company.cnpj, '\D', '', 'g');

notify pgrst, 'reload schema';
commit;

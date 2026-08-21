-- Toda empresa precisa estar imediatamente pronta para a configuração do
-- provedor fiscal e do certificado A1. Sem estes registros a tela de
-- integração falha ao consultar a configuração recém-criada.
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
  values (new.id, regexp_replace(new.cnpj, '\\D', '', 'g'))
  on conflict (company_id) do update
    set cnpj = excluded.cnpj,
        updated_at = now();

  return new;
end;
$$;

revoke all on function apfiscal.initialize_company_fiscal_integration() from public, anon, authenticated;

drop trigger if exists apfiscal_initialize_company_fiscal_integration on apfiscal.companies;
create trigger apfiscal_initialize_company_fiscal_integration
after insert on apfiscal.companies
for each row execute function apfiscal.initialize_company_fiscal_integration();

-- Empresas existentes recebem apenas os registros ausentes, preservando a
-- configuração e o NSU que já possam ter sido gravados.
insert into apfiscal.empresa_integracoes_fiscais (organization_id, company_id)
select company.organization_id, company.id
from apfiscal.companies company
on conflict (company_id) do nothing;

insert into apfiscal.fiscal_distribution_state (company_id, cnpj)
select company.id, regexp_replace(company.cnpj, '\\D', '', 'g')
from apfiscal.companies company
on conflict (company_id) do update
  set cnpj = excluded.cnpj,
      updated_at = now();

notify pgrst, 'reload schema';
commit;

begin;
set local search_path = apfiscal, public, extensions;

alter table apfiscal.fiscal_documents
  add column if not exists supplier_id uuid references apfiscal.suppliers(id) on delete set null;

create index if not exists fiscal_documents_supplier_emissao_idx
  on apfiscal.fiscal_documents (supplier_id, data_emissao desc)
  where supplier_id is not null;

-- Existing imports predate the explicit relationship. Prefer a company supplier;
-- when the catalog is global, use the organization-wide supplier.
update apfiscal.fiscal_documents document
set supplier_id = (
  select supplier.id
  from apfiscal.suppliers supplier
  join apfiscal.companies company on company.id = document.company_id
  where supplier.organization_id = company.organization_id
    and regexp_replace(supplier.cnpj_cpf, '\D', '', 'g') = regexp_replace(coalesce(document.emitente_cnpj, ''), '\D', '', 'g')
    and (supplier.company_id = document.company_id or supplier.company_id is null)
  order by (supplier.company_id = document.company_id) desc
  limit 1
)
where document.supplier_id is null
  and regexp_replace(coalesce(document.emitente_cnpj, ''), '\D', '', 'g') <> ''
  and exists (
    select 1
    from apfiscal.suppliers supplier
    join apfiscal.companies company on company.id = document.company_id
    where supplier.organization_id = company.organization_id
      and regexp_replace(supplier.cnpj_cpf, '\D', '', 'g') = regexp_replace(document.emitente_cnpj, '\D', '', 'g')
      and (supplier.company_id = document.company_id or supplier.company_id is null)
  );

commit;

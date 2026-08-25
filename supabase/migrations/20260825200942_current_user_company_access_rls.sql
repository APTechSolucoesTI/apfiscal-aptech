begin;
set local search_path = apfiscal, public, extensions;

-- Variante segura para políticas RLS: o usuário é sempre obtido do JWT e não
-- pode ser escolhido pelo chamador. A função administrativa que aceita user_id
-- continua restrita ao service_role.
create or replace function apfiscal.current_user_can_access_company(_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = apfiscal, pg_temp
as $$
  select exists (
    select 1
    from apfiscal.companies company
    join apfiscal.organization_members member
      on member.organization_id = company.organization_id
    where company.id = _company_id
      and member.user_id = (select auth.uid())
      and member.active
      and (
        not exists (
          select 1 from apfiscal.company_access access
          where access.user_id = (select auth.uid())
        )
        or exists (
          select 1 from apfiscal.company_access access
          where access.user_id = (select auth.uid())
            and access.company_id = _company_id
        )
      )
  )
$$;

revoke all on function apfiscal.current_user_can_access_company(uuid)
  from public, anon, authenticated, service_role;
grant execute on function apfiscal.current_user_can_access_company(uuid)
  to authenticated, service_role;

drop policy if exists "Membros podem ver manifestações" on apfiscal.manifestations;
create policy "Membros podem ver manifestações"
  on apfiscal.manifestations for select to authenticated
  using (
    apfiscal.is_org_member(organization_id)
    and apfiscal.current_user_can_access_company(company_id)
  );

drop policy if exists "Admins e Financeiros podem manifestar" on apfiscal.manifestations;
create policy "Admins e Financeiros podem manifestar"
  on apfiscal.manifestations for insert to authenticated
  with check (
    apfiscal.is_org_member(organization_id)
    and apfiscal.current_user_can_access_company(company_id)
  );

drop policy if exists "Members view NFS-e distribution documents"
  on apfiscal.nfse_distribution_documents;
create policy "Members view NFS-e distribution documents"
  on apfiscal.nfse_distribution_documents for select to authenticated
  using (
    apfiscal.is_org_member(organization_id)
    and apfiscal.current_user_can_access_company(company_id)
  );

drop policy if exists "Members view fiscal document history"
  on apfiscal.fiscal_document_history;
create policy "Members view fiscal document history"
  on apfiscal.fiscal_document_history for select to authenticated
  using (
    apfiscal.is_org_member(organization_id)
    and apfiscal.current_user_can_access_company(company_id)
  );

comment on function apfiscal.current_user_can_access_company(uuid) is
  'Verifica o escopo de empresa do usuário autenticado sem aceitar user_id arbitrário.';

notify pgrst, 'reload schema';
commit;

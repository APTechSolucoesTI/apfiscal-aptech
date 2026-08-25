begin;
set local search_path = apfiscal, public, extensions;

-- Corrige o legado que possuía XML completo, mas continuava classificado como
-- resumo/pendência de manifestação.
update apfiscal.documentos_fiscais_integracao
set status = 'completa',
    status_download = 'completo_disponivel',
    mensagem_sefaz = null,
    ultima_sincronizacao = coalesce(ultima_sincronizacao, updated_at, now())
where xml_completo_path is not null
  and (status <> 'completa' or status_download <> 'completo_disponivel');

-- A manifestação nasce quando ainda existe apenas o resumo da distribuição.
-- Por isso o vínculo canônico é empresa + chave, e não exclusivamente a NF-e
-- completa de fiscal_documents.
alter table apfiscal.manifestations
  alter column fiscal_document_id drop not null,
  alter column usuario_id drop not null,
  add column if not exists organization_id uuid references apfiscal.organizations(id) on delete cascade,
  add column if not exists company_id uuid references apfiscal.companies(id) on delete cascade,
  add column if not exists integration_document_id uuid references apfiscal.documentos_fiscais_integracao(id) on delete cascade,
  add column if not exists access_key text,
  add column if not exists tp_evento text,
  add column if not exists descricao_evento text,
  add column if not exists status text not null default 'requested',
  add column if not exists protocolo text,
  add column if not exists event_at timestamptz,
  add column if not exists request_payload jsonb,
  add column if not exists response_payload jsonb,
  add column if not exists source text not null default 'user',
  add column if not exists updated_at timestamptz not null default now();

update apfiscal.manifestations manifestation
set organization_id = company.organization_id,
    company_id = document.company_id,
    access_key = document.chave_acesso,
    integration_document_id = integration.id,
    tp_evento = case manifestation.tipo
      when 'confirmacao' then '210200'
      when 'ciencia' then '210210'
      when 'desconhecimento' then '210220'
      when 'nao_realizada' then '210240'
      else manifestation.tp_evento
    end,
    status = case
      when manifestation.response_cstat in ('135', '136', '573') then 'accepted'
      when manifestation.response_cstat is null then 'requested'
      else 'rejected'
    end,
    updated_at = coalesce(manifestation.updated_at, manifestation.requested_at, manifestation.created_at, now())
from apfiscal.fiscal_documents document
join apfiscal.companies company on company.id = document.company_id
left join apfiscal.documentos_fiscais_integracao integration
  on integration.company_id = document.company_id
 and integration.chave = document.chave_acesso
where manifestation.fiscal_document_id = document.id;

alter table apfiscal.manifestations
  alter column organization_id set not null,
  alter column company_id set not null,
  alter column access_key set not null;

alter table apfiscal.manifestations
  drop constraint if exists manifestations_status_check,
  add constraint manifestations_status_check
    check (status in ('requested', 'accepted', 'rejected', 'error')),
  drop constraint if exists manifestations_source_check,
  add constraint manifestations_source_check
    check (source in ('user', 'distribution', 'system')),
  drop constraint if exists manifestations_access_key_check,
  add constraint manifestations_access_key_check
    check (access_key ~ '^[0-9]{44}$'),
  drop constraint if exists manifestations_document_link_check,
  add constraint manifestations_document_link_check
    check (fiscal_document_id is not null or integration_document_id is not null);

drop index if exists apfiscal.manifestations_idempotency_uidx;
create unique index manifestations_company_event_sequence_uidx
  on apfiscal.manifestations(company_id, access_key, tipo, sequence);
create index manifestations_integration_timeline_idx
  on apfiscal.manifestations(integration_document_id, event_at desc, requested_at desc);
create index manifestations_company_access_key_idx
  on apfiscal.manifestations(company_id, access_key, requested_at desc);

drop trigger if exists update_manifestations_updated_at on apfiscal.manifestations;
create trigger update_manifestations_updated_at
  before update on apfiscal.manifestations
  for each row execute function apfiscal.update_updated_at_column();

drop policy if exists "Membros podem ver manifestações" on apfiscal.manifestations;
create policy "Membros podem ver manifestações"
  on apfiscal.manifestations for select to authenticated
  using (
    apfiscal.is_org_member(organization_id)
    and apfiscal.user_can_access_company((select auth.uid()), company_id)
  );

drop policy if exists "Admins e Financeiros podem manifestar" on apfiscal.manifestations;
create policy "Admins e Financeiros podem manifestar"
  on apfiscal.manifestations for insert to authenticated
  with check (
    apfiscal.is_org_member(organization_id)
    and apfiscal.user_can_access_company((select auth.uid()), company_id)
  );

comment on table apfiscal.manifestations is
  'Histórico auditável de manifestações, vinculado desde a resNFe até a NF-e completa.';
comment on column apfiscal.manifestations.access_key is
  'Identidade fiscal estável durante todo o ciclo resumo, evento e XML completo.';

notify pgrst, 'reload schema';
commit;

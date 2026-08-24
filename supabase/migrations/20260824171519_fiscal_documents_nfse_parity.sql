begin;

alter table apfiscal.fiscal_documents
  add column if not exists external_id text,
  add column if not exists verification_code text,
  add column if not exists competence_date date,
  add column if not exists service_municipality_code text,
  add column if not exists service_municipality_name text,
  add column if not exists incidence_municipality_code text,
  add column if not exists incidence_municipality_name text,
  add column if not exists service_gross_value numeric(18,2),
  add column if not exists service_net_value numeric(18,2),
  add column if not exists deductions_value numeric(18,2),
  add column if not exists unconditional_discount_value numeric(18,2),
  add column if not exists conditional_discount_value numeric(18,2),
  add column if not exists retentions_value numeric(18,2),
  add column if not exists iss_base_value numeric(18,2),
  add column if not exists iss_rate numeric(9,4),
  add column if not exists iss_value numeric(18,2),
  add column if not exists service_code_national text,
  add column if not exists service_code_municipal text,
  add column if not exists cnae_code text,
  add column if not exists service_description text,
  add column if not exists tax_regime text,
  add column if not exists special_tax_regime text,
  add column if not exists nfse_details jsonb not null default '{}'::jsonb,
  add column if not exists sync_status text not null default 'processed',
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists last_sync_success_at timestamptz,
  add column if not exists processing_error text,
  add column if not exists updated_at timestamptz not null default now();

alter table apfiscal.fiscal_documents
  drop constraint if exists fiscal_documents_sync_status_check;
alter table apfiscal.fiscal_documents
  add constraint fiscal_documents_sync_status_check
  check (sync_status in ('discovered','processing','processed','error','cancelled','replaced'));

create index if not exists fiscal_documents_type_company_emission_idx
  on apfiscal.fiscal_documents (tipo, company_id, data_emissao desc);
create index if not exists fiscal_documents_type_sync_status_idx
  on apfiscal.fiscal_documents (tipo, sync_status, data_emissao desc);
create index if not exists fiscal_documents_nfse_competence_idx
  on apfiscal.fiscal_documents (company_id, competence_date desc)
  where tipo = 'nfse';
create index if not exists fiscal_documents_nfse_issuer_idx
  on apfiscal.fiscal_documents (company_id, emitente_cnpj)
  where tipo = 'nfse';

drop trigger if exists update_fiscal_documents_updated_at on apfiscal.fiscal_documents;
create trigger update_fiscal_documents_updated_at
  before update on apfiscal.fiscal_documents
  for each row execute function apfiscal.update_updated_at_column();

alter table apfiscal.documentos_fiscais_integracao
  add column if not exists fiscal_document_id uuid references apfiscal.fiscal_documents(id) on delete set null,
  add column if not exists numero text,
  add column if not exists serie text,
  add column if not exists situacao text,
  add column if not exists tipo_evento text,
  add column if not exists schema_documento text,
  add column if not exists data_recebimento timestamptz,
  add column if not exists status_manifestacao text,
  add column if not exists status_download text not null default 'pendente',
  add column if not exists ultima_sincronizacao timestamptz;

alter table apfiscal.documentos_fiscais_integracao
  drop constraint if exists documentos_fiscais_integracao_status_download_check;
alter table apfiscal.documentos_fiscais_integracao
  add constraint documentos_fiscais_integracao_status_download_check
  check (status_download in ('pendente','resumo_disponivel','completo_disponivel','erro'));

create unique index if not exists documentos_fiscais_integracao_fiscal_document_uidx
  on apfiscal.documentos_fiscais_integracao (fiscal_document_id)
  where fiscal_document_id is not null;
create index if not exists documentos_fiscais_integracao_company_received_idx
  on apfiscal.documentos_fiscais_integracao (company_id, data_recebimento desc, nsu desc);

update apfiscal.documentos_fiscais_integracao summary
set fiscal_document_id = document.id,
    numero = coalesce(summary.numero, document.numero),
    serie = coalesce(summary.serie, document.serie),
    situacao = coalesce(summary.situacao, document.situacao),
    status_download = case
      when summary.xml_completo_path is not null then 'completo_disponivel'
      when summary.xml_resumido_path is not null then 'resumo_disponivel'
      else summary.status_download
    end,
    ultima_sincronizacao = coalesce(summary.ultima_sincronizacao, summary.updated_at)
from apfiscal.fiscal_documents document
where document.company_id = summary.company_id
  and document.chave_acesso = summary.chave;

create table if not exists apfiscal.fiscal_document_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  company_id uuid not null references apfiscal.companies(id) on delete cascade,
  fiscal_document_id uuid not null references apfiscal.fiscal_documents(id) on delete cascade,
  event_type text not null,
  status text,
  message text,
  payload jsonb,
  created_by uuid references apfiscal.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists fiscal_document_history_document_idx
  on apfiscal.fiscal_document_history (fiscal_document_id, occurred_at desc);
create index if not exists fiscal_document_history_company_idx
  on apfiscal.fiscal_document_history (company_id, occurred_at desc);

insert into apfiscal.fiscal_document_history (
  organization_id,
  company_id,
  fiscal_document_id,
  event_type,
  status,
  message,
  occurred_at
)
select
  company.organization_id,
  document.company_id,
  document.id,
  'imported',
  'success',
  'Documento fiscal existente incorporado ao histórico.',
  document.created_at
from apfiscal.fiscal_documents document
join apfiscal.companies company on company.id = document.company_id
where not exists (
  select 1
  from apfiscal.fiscal_document_history history
  where history.fiscal_document_id = document.id
);

alter table apfiscal.fiscal_document_history enable row level security;
drop policy if exists "Members view fiscal document history" on apfiscal.fiscal_document_history;
create policy "Members view fiscal document history"
  on apfiscal.fiscal_document_history for select to authenticated
  using (
    apfiscal.is_org_member(organization_id)
    and apfiscal.user_can_access_company((select auth.uid()), company_id)
  );
grant select on apfiscal.fiscal_document_history to authenticated;
grant all on apfiscal.fiscal_document_history to service_role;

comment on table apfiscal.fiscal_document_history is
  'Auditoria compartilhada de importacao, sincronizacao, processamento e integracao de documentos fiscais.';
comment on column apfiscal.fiscal_documents.nfse_details is
  'Estrutura canonica complementar da NFS-e. Mantem campos variaveis entre ADN e provedores municipais.';
comment on column apfiscal.documentos_fiscais_integracao.fiscal_document_id is
  'Vinculo idempotente entre documento descoberto na distribuicao DF-e e NF-e canonica completa.';

notify pgrst, 'reload schema';

commit;

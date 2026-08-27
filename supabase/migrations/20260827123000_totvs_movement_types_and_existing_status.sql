create table if not exists apfiscal.tipos_movimento_totvs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  company_id uuid not null references apfiscal.companies(id) on delete cascade,
  connection_key text not null,
  coligada_id integer not null,
  codigo text not null,
  descricao text not null,
  ativo boolean not null default true,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tipos_movimento_totvs_company_codigo_key unique (company_id, codigo)
);

create index if not exists idx_tipos_movimento_totvs_org_company
  on apfiscal.tipos_movimento_totvs (organization_id, company_id, ativo, codigo);

alter table apfiscal.tipos_movimento_totvs enable row level security;
grant select, insert, update, delete on apfiscal.tipos_movimento_totvs to authenticated;
grant all on apfiscal.tipos_movimento_totvs to service_role;
create policy "tipos_movimento_totvs_org_members_all"
  on apfiscal.tipos_movimento_totvs for all to authenticated
  using (apfiscal.is_org_member(organization_id))
  with check (apfiscal.is_org_member(organization_id));

create table if not exists apfiscal.tipos_movimento_documentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  tipo_movimento_id uuid not null references apfiscal.tipos_movimento_totvs(id) on delete cascade,
  tipo_documento text not null check (tipo_documento in ('nfe', 'nfse')),
  created_at timestamptz not null default now(),
  constraint tipos_movimento_documentos_unique unique (tipo_movimento_id, tipo_documento)
);

create index if not exists idx_tipos_movimento_documentos_org_tipo
  on apfiscal.tipos_movimento_documentos (organization_id, tipo_documento);

alter table apfiscal.tipos_movimento_documentos enable row level security;
grant select, insert, update, delete on apfiscal.tipos_movimento_documentos to authenticated;
grant all on apfiscal.tipos_movimento_documentos to service_role;
create policy "tipos_movimento_documentos_org_members_all"
  on apfiscal.tipos_movimento_documentos for all to authenticated
  using (apfiscal.is_org_member(organization_id))
  with check (apfiscal.is_org_member(organization_id));

alter table apfiscal.fiscal_documents
  add column if not exists tipo_movimento_id uuid references apfiscal.tipos_movimento_totvs(id) on delete set null,
  add column if not exists totvs_integration_origin text;

alter table apfiscal.fiscal_documents
  drop constraint if exists fiscal_documents_totvs_integration_origin_check;
alter table apfiscal.fiscal_documents
  add constraint fiscal_documents_totvs_integration_origin_check
  check (totvs_integration_origin is null or totvs_integration_origin in ('apfiscal', 'preexisting'));

create index if not exists idx_fiscal_documents_tipo_movimento
  on apfiscal.fiscal_documents (tipo_movimento_id);

update apfiscal.fiscal_documents document
set status = 'ja_existente_totvs'::apfiscal.nfe_status,
    totvs_integration_origin = 'preexisting',
    status_observacao = coalesce(document.status_observacao, 'Documento já existente no TOTVS RM.')
where document.status = 'integrado_totvs'::apfiscal.nfe_status
  and not exists (
    select 1
    from apfiscal.totvs_integration_runs run
    where run.fiscal_document_id = document.id
      and run.status = 'succeeded'
      and coalesce((run.response_payload ->> 'alreadyExisted')::boolean, false) = false
  );

update apfiscal.fiscal_documents document
set totvs_integration_origin = 'apfiscal'
where document.status = 'integrado_totvs'::apfiscal.nfe_status
  and document.totvs_integration_origin is null;

notify pgrst, 'reload schema';

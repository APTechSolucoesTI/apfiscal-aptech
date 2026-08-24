alter table apfiscal.fiscal_documents
  drop constraint if exists fiscal_documents_source_provider_check;

alter table apfiscal.fiscal_documents
  add constraint fiscal_documents_source_provider_check
  check (
    source_provider is null
    or source_provider in ('nfewizard', 'apifiscal', 'nacional_adn', 'manual')
  );

comment on column apfiscal.fiscal_documents.source_provider is
  'Provedor que originou o documento fiscal, incluindo a distribuição nacional de NFS-e (ADN).';

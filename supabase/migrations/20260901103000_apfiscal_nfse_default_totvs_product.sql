alter table apfiscal.empresa_integracoes_fiscais
  add column if not exists nfse_default_product_code text not null default '001.01.01.000001';

alter table apfiscal.empresa_integracoes_fiscais
  drop constraint if exists empresa_integracoes_fiscais_nfse_default_product_code_chk;

alter table apfiscal.empresa_integracoes_fiscais
  add constraint empresa_integracoes_fiscais_nfse_default_product_code_chk
  check (
    char_length(trim(nfse_default_product_code)) between 1 and 50
    and nfse_default_product_code = trim(nfse_default_product_code)
  );

comment on column apfiscal.empresa_integracoes_fiscais.nfse_default_product_code is
  'Codigo de produto/servico ja existente no TOTVS RM usado em todas as integracoes de NFS-e da empresa.';

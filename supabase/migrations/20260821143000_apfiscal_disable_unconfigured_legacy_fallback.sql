-- O APFiscal é apenas contingência. Nunca o habilitamos sem credenciais, pois
-- isso mascara erros de configuração do NFeWizard com uma falha do legado.
begin;
set local search_path = apfiscal, public, extensions;

alter table apfiscal.empresa_integracoes_fiscais
  alter column fallback_enabled set default false;

update apfiscal.empresa_integracoes_fiscais
set fallback_enabled = false,
    apifiscal_certificate_last_error = null
where fallback_provider = 'apifiscal'
  and api_key_encrypted is null;

notify pgrst, 'reload schema';
commit;

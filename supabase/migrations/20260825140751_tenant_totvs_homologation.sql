alter table apfiscal.organizations
  add column if not exists totvs_homologation_mode boolean not null default false;

comment on column apfiscal.organizations.totvs_homologation_mode is
  'Quando ativo, resolve a conexão base do tenant para a chave equivalente com sufixo _HOMOLOG.';

notify pgrst, 'reload schema';

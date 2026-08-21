begin;
set local search_path = apfiscal, public, extensions;

-- Alguns produtos do RM não possuem uma linha sintética correspondente em
-- TPRODUTO. A releitura permite criar os prefixos ausentes e vincular os itens.
delete from apfiscal.totvs_sync_checkpoints
where entity = 'products';

commit;

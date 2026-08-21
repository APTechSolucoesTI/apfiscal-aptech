begin;
set local search_path = apfiscal, public, extensions;

-- A primeira execução com a hierarquia do TPRODUTO precisa reler os produtos
-- históricos para preencher familia_id, grupo_id e subgrupo_id.
delete from apfiscal.totvs_sync_checkpoints
where entity = 'products';

commit;

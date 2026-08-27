update apfiscal.fiscal_documents
set sync_status = 'processed',
    updated_at = now()
where tipo = 'nfse'
  and trim(coalesce(situacao, '')) in ('100', '102', '103', '107')
  and sync_status is distinct from 'processed';

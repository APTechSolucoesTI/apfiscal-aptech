begin;

set local search_path = apfiscal, public, extensions;

-- Global RM rows (coligada 0) were absent from previous reads. Reopen only the
-- incremental entities so the next run fetches their complete history once.
delete from apfiscal.totvs_sync_checkpoints
where entity in (
  'suppliers',
  'supplier_addresses',
  'supplier_contacts',
  'supplier_defaults',
  'products'
);

commit;

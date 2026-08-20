
-- Deduplicate products before creating the unique index (keep oldest)
DELETE FROM public.products p
USING public.products p2
WHERE p.company_id IS NOT DISTINCT FROM p2.company_id
  AND p.codigo = p2.codigo
  AND p.created_at > p2.created_at;

DELETE FROM public.suppliers s
USING public.suppliers s2
WHERE s.company_id IS NOT DISTINCT FROM s2.company_id
  AND s.cnpj_cpf = s2.cnpj_cpf
  AND s.created_at > s2.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_codigo_key
  ON public.products(company_id, codigo);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_cnpjcpf_key
  ON public.suppliers(company_id, cnpj_cpf);

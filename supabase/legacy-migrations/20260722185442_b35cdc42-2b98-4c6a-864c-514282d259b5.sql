
-- 1) Catalog scope on organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS catalog_scope text NOT NULL DEFAULT 'per_company'
    CHECK (catalog_scope IN ('global','per_company'));

-- Allow org admins to update their organization settings
DROP POLICY IF EXISTS "Admins atualizam organização" ON public.organizations;
CREATE POLICY "Admins atualizam organização" ON public.organizations
  FOR UPDATE TO authenticated
  USING (has_org_role(id, ARRAY['admin']::app_role[]))
  WITH CHECK (has_org_role(id, ARRAY['admin']::app_role[]));

-- 2) Make company_id nullable on suppliers/products (null = global to org)
ALTER TABLE public.suppliers ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.products  ALTER COLUMN company_id DROP NOT NULL;

-- 3) Replace unique constraints with partial indexes that also cover global rows
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_company_id_cnpj_cpf_key;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_cnpj_uidx
  ON public.suppliers (company_id, cnpj_cpf) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_global_cnpj_uidx
  ON public.suppliers (organization_id, cnpj_cpf) WHERE company_id IS NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_company_id_codigo_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_company_codigo_uidx
  ON public.products (company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_org_global_codigo_uidx
  ON public.products (organization_id, codigo) WHERE company_id IS NULL;

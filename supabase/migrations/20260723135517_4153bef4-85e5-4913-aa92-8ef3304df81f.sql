
CREATE TABLE public.familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.familias TO authenticated;
GRANT ALL ON public.familias TO service_role;
ALTER TABLE public.familias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage familias" ON public.familias
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE UNIQUE INDEX familias_company_codigo_uidx ON public.familias(company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX familias_org_global_codigo_uidx ON public.familias(organization_id, codigo) WHERE company_id IS NULL;
CREATE INDEX familias_org_idx ON public.familias(organization_id);
CREATE TRIGGER update_familias_updated_at BEFORE UPDATE ON public.familias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos TO authenticated;
GRANT ALL ON public.grupos TO service_role;
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage grupos" ON public.grupos
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE UNIQUE INDEX grupos_company_codigo_uidx ON public.grupos(company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX grupos_org_global_codigo_uidx ON public.grupos(organization_id, codigo) WHERE company_id IS NULL;
CREATE INDEX grupos_org_idx ON public.grupos(organization_id);
CREATE TRIGGER update_grupos_updated_at BEFORE UPDATE ON public.grupos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.subgrupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subgrupos TO authenticated;
GRANT ALL ON public.subgrupos TO service_role;
ALTER TABLE public.subgrupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage subgrupos" ON public.subgrupos
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE UNIQUE INDEX subgrupos_company_codigo_uidx ON public.subgrupos(company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX subgrupos_org_global_codigo_uidx ON public.subgrupos(organization_id, codigo) WHERE company_id IS NULL;
CREATE INDEX subgrupos_org_idx ON public.subgrupos(organization_id);
CREATE TRIGGER update_subgrupos_updated_at BEFORE UPDATE ON public.subgrupos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo_interno text NOT NULL,
  descricao text NOT NULL,
  unidade text NOT NULL,
  ean_gtin text,
  ncm text NOT NULL,
  cest text,
  origem_mercadoria smallint NOT NULL DEFAULT 0 CHECK (origem_mercadoria BETWEEN 0 AND 8),
  familia_id uuid REFERENCES public.familias(id) ON DELETE SET NULL,
  grupo_id uuid REFERENCES public.grupos(id) ON DELETE SET NULL,
  subgrupo_id uuid REFERENCES public.subgrupos(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos TO authenticated;
GRANT ALL ON public.produtos TO service_role;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage produtos" ON public.produtos
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE UNIQUE INDEX produtos_company_codigo_uidx ON public.produtos(company_id, codigo_interno) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX produtos_org_global_codigo_uidx ON public.produtos(organization_id, codigo_interno) WHERE company_id IS NULL;
CREATE INDEX produtos_org_idx ON public.produtos(organization_id);
CREATE INDEX produtos_company_idx ON public.produtos(company_id);
CREATE INDEX produtos_familia_idx ON public.produtos(familia_id);
CREATE INDEX produtos_grupo_idx ON public.produtos(grupo_id);
CREATE INDEX produtos_subgrupo_idx ON public.produtos(subgrupo_id);
CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.produtos_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  codigo_item_nota text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produtos_fornecedores TO authenticated;
GRANT ALL ON public.produtos_fornecedores TO service_role;
ALTER TABLE public.produtos_fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage produtos_fornecedores" ON public.produtos_fornecedores
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE UNIQUE INDEX produtos_forn_company_codigo_uidx
  ON public.produtos_fornecedores(empresa_id, fornecedor_id, codigo_item_nota)
  WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX produtos_forn_org_global_codigo_uidx
  ON public.produtos_fornecedores(organization_id, fornecedor_id, codigo_item_nota)
  WHERE empresa_id IS NULL;
CREATE INDEX produtos_forn_produto_idx ON public.produtos_fornecedores(produto_id);
CREATE INDEX produtos_forn_fornecedor_idx ON public.produtos_fornecedores(fornecedor_id);
CREATE INDEX produtos_forn_org_idx ON public.produtos_fornecedores(organization_id);
CREATE TRIGGER update_produtos_fornecedores_updated_at BEFORE UPDATE ON public.produtos_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.fiscal_document_items
  ADD COLUMN IF NOT EXISTS status_vinculo text NOT NULL DEFAULT 'pendente'
  CHECK (status_vinculo IN ('vinculado', 'pendente', 'ignorado'));

-- Drop FK before repointing so we can move product_id to produtos ids
ALTER TABLE public.fiscal_document_items DROP CONSTRAINT IF EXISTS fiscal_document_items_product_id_fkey;

CREATE TEMP TABLE _prod_map ON COMMIT DROP AS
SELECT id AS old_id, gen_random_uuid() AS new_id FROM public.products;

INSERT INTO public.produtos (
  id, organization_id, company_id, codigo_interno, descricao,
  unidade, ean_gtin, ncm, cest, origem_mercadoria, ativo, created_at, updated_at
)
SELECT
  m.new_id, p.organization_id, p.company_id, p.codigo,
  COALESCE(NULLIF(p.descricao, ''), p.codigo),
  COALESCE(NULLIF(p.unidade, ''), 'UN'),
  NULLIF(p.ean, ''),
  COALESCE(NULLIF(regexp_replace(COALESCE(p.ncm, ''), '\D', '', 'g'), ''), '00000000'),
  NULLIF(p.cest, ''),
  CASE WHEN p.origem_mercadoria ~ '^[0-8]$' THEN p.origem_mercadoria::smallint ELSE 0 END,
  p.ativo, p.created_at, p.updated_at
FROM public.products p
JOIN _prod_map m ON m.old_id = p.id;

UPDATE public.fiscal_document_items fdi
SET product_id = m.new_id
FROM _prod_map m
WHERE fdi.product_id = m.old_id;

INSERT INTO public.produtos_fornecedores (organization_id, empresa_id, produto_id, fornecedor_id, codigo_item_nota)
SELECT DISTINCT ON (p.organization_id, p.company_id, p.supplier_id, p.codigo)
  p.organization_id, p.company_id, m.new_id, p.supplier_id, p.codigo
FROM public.products p
JOIN _prod_map m ON m.old_id = p.id
WHERE p.supplier_id IS NOT NULL;

UPDATE public.fiscal_document_items
SET status_vinculo = 'vinculado'
WHERE product_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.upsert_product_from_nfe(uuid, uuid, text, text, text, text, text, text, numeric, uuid);
DROP TABLE public.products;

-- Re-add FK pointing to produtos
ALTER TABLE public.fiscal_document_items
  ADD CONSTRAINT fiscal_document_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.produtos(id) ON DELETE SET NULL;

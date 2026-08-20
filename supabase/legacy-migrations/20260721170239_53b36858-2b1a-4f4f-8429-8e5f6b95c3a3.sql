
-- Suppliers table (fornecedores) per company
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cnpj_cpf TEXT NOT NULL,
  tipo_pessoa TEXT NOT NULL DEFAULT 'juridica',
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  inscricao_estadual TEXT,
  inscricao_municipal TEXT,
  email TEXT,
  telefone TEXT,
  cep TEXT,
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  municipio TEXT,
  uf TEXT,
  -- ERP integration fields
  erp_system TEXT,
  erp_code TEXT,
  erp_external_id TEXT,
  erp_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  erp_synced_at TIMESTAMPTZ,
  origem TEXT NOT NULL DEFAULT 'manual', -- manual | auto_nfe | erp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, cnpj_cpf)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage suppliers"
  ON public.suppliers FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE INDEX suppliers_company_idx ON public.suppliers(company_id);
CREATE INDEX suppliers_org_idx ON public.suppliers(organization_id);
CREATE INDEX suppliers_cnpj_idx ON public.suppliers(cnpj_cpf);

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Products table (produtos) per company
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  codigo_fornecedor TEXT,
  descricao TEXT NOT NULL,
  ncm TEXT,
  cest TEXT,
  cfop_padrao TEXT,
  unidade TEXT,
  ean TEXT,
  origem_mercadoria TEXT,
  valor_unitario NUMERIC(15,4),
  aliquota_icms NUMERIC(6,3),
  aliquota_ipi NUMERIC(6,3),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  -- ERP integration fields
  erp_system TEXT,
  erp_code TEXT,
  erp_external_id TEXT,
  erp_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  erp_synced_at TIMESTAMPTZ,
  origem TEXT NOT NULL DEFAULT 'manual',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, codigo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage products"
  ON public.products FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE INDEX products_company_idx ON public.products(company_id);
CREATE INDEX products_org_idx ON public.products(organization_id);
CREATE INDEX products_supplier_idx ON public.products(supplier_id);
CREATE INDEX products_codigo_idx ON public.products(codigo);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: upsert supplier from incoming NF-e emitente
CREATE OR REPLACE FUNCTION public.upsert_supplier_from_nfe(
  _organization_id UUID,
  _company_id UUID,
  _cnpj TEXT,
  _razao_social TEXT,
  _nome_fantasia TEXT DEFAULT NULL,
  _ie TEXT DEFAULT NULL,
  _endereco JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.suppliers (
    organization_id, company_id, cnpj_cpf, razao_social, nome_fantasia,
    inscricao_estadual, cep, logradouro, numero, complemento, bairro, municipio, uf,
    origem
  ) VALUES (
    _organization_id, _company_id, _cnpj, _razao_social, _nome_fantasia,
    _ie,
    _endereco->>'cep', _endereco->>'logradouro', _endereco->>'numero',
    _endereco->>'complemento', _endereco->>'bairro', _endereco->>'municipio', _endereco->>'uf',
    'auto_nfe'
  )
  ON CONFLICT (company_id, cnpj_cpf) DO UPDATE
    SET razao_social = EXCLUDED.razao_social,
        nome_fantasia = COALESCE(EXCLUDED.nome_fantasia, public.suppliers.nome_fantasia),
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Helper: upsert product from NF-e item
CREATE OR REPLACE FUNCTION public.upsert_product_from_nfe(
  _organization_id UUID,
  _company_id UUID,
  _codigo TEXT,
  _descricao TEXT,
  _ncm TEXT DEFAULT NULL,
  _cfop TEXT DEFAULT NULL,
  _unidade TEXT DEFAULT NULL,
  _ean TEXT DEFAULT NULL,
  _valor_unitario NUMERIC DEFAULT NULL,
  _supplier_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.products (
    organization_id, company_id, codigo, descricao, ncm, cfop_padrao,
    unidade, ean, valor_unitario, supplier_id, origem
  ) VALUES (
    _organization_id, _company_id, _codigo, _descricao, _ncm, _cfop,
    _unidade, _ean, _valor_unitario, _supplier_id, 'auto_nfe'
  )
  ON CONFLICT (company_id, codigo) DO UPDATE
    SET descricao = EXCLUDED.descricao,
        ncm = COALESCE(EXCLUDED.ncm, public.products.ncm),
        valor_unitario = COALESCE(EXCLUDED.valor_unitario, public.products.valor_unitario),
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

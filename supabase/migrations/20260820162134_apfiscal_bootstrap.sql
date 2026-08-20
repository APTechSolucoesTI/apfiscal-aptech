-- Bootstrap isolado do APFiscal para Supabase compartilhado.
-- Consolidado das migrations históricas; não altera tabelas de outros produtos em public.
begin;
create schema if not exists apfiscal;
set local search_path = apfiscal, public, extensions;

-- Source: 20260720114153_77b2bc69-479a-4119-a84e-d7eb1975a4b0.sql
-- Enums
CREATE TYPE apfiscal.app_role AS ENUM ('admin', 'financeiro', 'visualizador');
CREATE TYPE apfiscal.document_type AS ENUM ('nfe', 'nfse', 'cte');

-- Organizations
CREATE TABLE apfiscal.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Organization Members
CREATE TABLE apfiscal.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES apfiscal.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'visualizador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Companies
CREATE TABLE apfiscal.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES apfiscal.organizations(id) ON DELETE CASCADE NOT NULL,
    cnpj TEXT NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    uf TEXT,
    regime_tributario TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Company Access
CREATE TABLE apfiscal.company_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES apfiscal.companies(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Digital Certificates
CREATE TABLE apfiscal.digital_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES apfiscal.companies(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Fiscal Documents
CREATE TABLE apfiscal.fiscal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES apfiscal.companies(id) ON DELETE CASCADE NOT NULL,
    tipo document_type NOT NULL,
    chave_acesso TEXT UNIQUE NOT NULL,
    numero TEXT NOT NULL,
    serie TEXT,
    emitente_cnpj TEXT,
    emitente_nome TEXT,
    valor_total DECIMAL(18, 2),
    valor_impostos DECIMAL(18, 2),
    situacao TEXT,
    status_manifestacao TEXT,
    data_emissao TIMESTAMP WITH TIME ZONE,
    xml_path TEXT,
    pdf_path TEXT,
    risk_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Manifestations
CREATE TABLE apfiscal.manifestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fiscal_document_id UUID REFERENCES apfiscal.fiscal_documents(id) ON DELETE CASCADE NOT NULL,
    tipo TEXT NOT NULL,
    usuario_id UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notifications
CREATE TABLE apfiscal.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES apfiscal.organizations(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    channel TEXT NOT NULL,
    payload JSONB,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Notification Settings
CREATE TABLE apfiscal.notification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES apfiscal.organizations(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    email_enabled BOOLEAN DEFAULT TRUE,
    webhook_url TEXT
);

-- Audit Logs
CREATE TABLE apfiscal.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES apfiscal.organizations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- API Keys
CREATE TABLE apfiscal.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES apfiscal.organizations(id) ON DELETE CASCADE NOT NULL,
    key_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.organizations TO authenticated;
GRANT ALL ON apfiscal.organizations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.organization_members TO authenticated;
GRANT ALL ON apfiscal.organization_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.companies TO authenticated;
GRANT ALL ON apfiscal.companies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.company_access TO authenticated;
GRANT ALL ON apfiscal.company_access TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.digital_certificates TO authenticated;
GRANT ALL ON apfiscal.digital_certificates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.fiscal_documents TO authenticated;
GRANT ALL ON apfiscal.fiscal_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.manifestations TO authenticated;
GRANT ALL ON apfiscal.manifestations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.notifications TO authenticated;
GRANT ALL ON apfiscal.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.notification_settings TO authenticated;
GRANT ALL ON apfiscal.notification_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.audit_logs TO authenticated;
GRANT ALL ON apfiscal.audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.api_keys TO authenticated;
GRANT ALL ON apfiscal.api_keys TO service_role;

-- RLS
ALTER TABLE apfiscal.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.company_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.digital_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.manifestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE apfiscal.api_keys ENABLE ROW LEVEL SECURITY;

-- Basic Policies (example: organization member access)
CREATE POLICY "Membros da organização podem ver a organização" ON apfiscal.organizations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members WHERE organization_id = organizations.id AND user_id = auth.uid()));
CREATE POLICY "Membros da organização podem ver a si mesmos" ON apfiscal.organization_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Membros da organização podem ver empresas" ON apfiscal.companies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members WHERE organization_id = companies.organization_id AND user_id = auth.uid()));

-- Source: 20260720114212_4547dff5-7cea-47f0-a4cf-3c54a9cdc071.sql
-- Additional RLS Policies

-- Organization Members management (Admins only)
CREATE POLICY "Admins podem gerenciar membros" ON apfiscal.organization_members FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om WHERE om.organization_id = organization_members.organization_id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- Companies management (Admins and Financeiro)
CREATE POLICY "Admins e Financeiros podem gerenciar empresas" ON apfiscal.companies FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om WHERE om.organization_id = companies.organization_id AND om.user_id = auth.uid() AND om.role IN ('admin', 'financeiro')));

-- Company Access
CREATE POLICY "Membros podem ver acessos a empresas" ON apfiscal.company_access FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om JOIN apfiscal.companies c ON c.organization_id = om.organization_id WHERE c.id = company_access.company_id AND om.user_id = auth.uid()));

-- Digital Certificates
CREATE POLICY "Membros podem ver certificados" ON apfiscal.digital_certificates FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om JOIN apfiscal.companies c ON c.organization_id = om.organization_id WHERE c.id = digital_certificates.company_id AND om.user_id = auth.uid()));
CREATE POLICY "Admins podem gerenciar certificados" ON apfiscal.digital_certificates FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om JOIN apfiscal.companies c ON c.organization_id = om.organization_id WHERE c.id = digital_certificates.company_id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- Fiscal Documents
CREATE POLICY "Membros podem ver documentos fiscais" ON apfiscal.fiscal_documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om JOIN apfiscal.companies c ON c.organization_id = om.organization_id WHERE c.id = fiscal_documents.company_id AND om.user_id = auth.uid()));

-- Manifestations
CREATE POLICY "Membros podem ver manifestações" ON apfiscal.manifestations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om JOIN apfiscal.fiscal_documents fd ON fd.id = manifestations.fiscal_document_id JOIN apfiscal.companies c ON c.id = fd.company_id WHERE om.organization_id = c.organization_id AND om.user_id = auth.uid()));
CREATE POLICY "Admins e Financeiros podem manifestar" ON apfiscal.manifestations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM apfiscal.organization_members om JOIN apfiscal.fiscal_documents fd ON fd.id = manifestations.fiscal_document_id JOIN apfiscal.companies c ON c.id = fd.company_id WHERE om.organization_id = c.organization_id AND om.user_id = auth.uid() AND om.role IN ('admin', 'financeiro')));

-- Notifications
CREATE POLICY "Usuários podem ver suas notificações" ON apfiscal.notifications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om WHERE om.organization_id = notifications.organization_id AND om.user_id = auth.uid()));

-- Notification Settings
CREATE POLICY "Usuários podem gerenciar suas configurações de notificação" ON apfiscal.notification_settings FOR ALL TO authenticated USING (user_id = auth.uid());

-- Audit Logs
CREATE POLICY "Membros podem ver logs de auditoria" ON apfiscal.audit_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om WHERE om.organization_id = audit_logs.organization_id AND om.user_id = auth.uid()));

-- API Keys
CREATE POLICY "Admins podem gerenciar chaves de API" ON apfiscal.api_keys FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM apfiscal.organization_members om WHERE om.organization_id = api_keys.organization_id AND om.user_id = auth.uid() AND om.role = 'admin'));

-- Source: 20260721120234_365895c8-5713-4c77-be02-91e0c3cc2b0b.sql
ALTER TABLE apfiscal.companies
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS inscricao_municipal text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS municipio text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS responsavel text,
  ADD COLUMN IF NOT EXISTS cnae_principal text,
  ADD COLUMN IF NOT EXISTS cnaes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS companies_org_cnpj_unique ON apfiscal.companies (organization_id, cnpj);

CREATE OR REPLACE FUNCTION apfiscal.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = apfiscal, public, extensions;

DROP TRIGGER IF EXISTS update_companies_updated_at ON apfiscal.companies;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON apfiscal.companies
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

-- Helper: get or create the current user's organization + admin membership.
CREATE OR REPLACE FUNCTION apfiscal.ensure_user_organization()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = apfiscal, public, extensions
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
    FROM apfiscal.organization_members
   WHERE user_id = v_user_id
   LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  INSERT INTO apfiscal.organizations (name) VALUES ('Minha Organização')
    RETURNING id INTO v_org_id;

  INSERT INTO apfiscal.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'admin');

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION apfiscal.ensure_user_organization() TO authenticated;

-- Source: 20260721120250_4ac9c97e-7a36-461b-b64b-98e0e2b3ab6e.sql
REVOKE EXECUTE ON FUNCTION apfiscal.ensure_user_organization() FROM PUBLIC, anon;

-- Source: 20260721160820_c9d11aca-dde5-4d2c-baca-54945299c34c.sql
-- Security definer helpers to avoid recursive RLS on organization_members
CREATE OR REPLACE FUNCTION apfiscal.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = apfiscal, public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM apfiscal.organization_members WHERE organization_id = _org_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION apfiscal.has_org_role(_org_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = apfiscal, public, extensions AS $$
  SELECT EXISTS (SELECT 1 FROM apfiscal.organization_members WHERE organization_id = _org_id AND user_id = auth.uid() AND role = ANY(_roles));
$$;

-- Drop recursive policies
DROP POLICY IF EXISTS "Admins podem gerenciar membros" ON apfiscal.organization_members;
DROP POLICY IF EXISTS "Membros da organização podem ver a si mesmos" ON apfiscal.organization_members;
DROP POLICY IF EXISTS "Membros da organização podem ver a organização" ON apfiscal.organizations;
DROP POLICY IF EXISTS "Membros da organização podem ver empresas" ON apfiscal.companies;
DROP POLICY IF EXISTS "Admins e Financeiros podem gerenciar empresas" ON apfiscal.companies;

-- organization_members: non-recursive policies
CREATE POLICY "Ver próprios vínculos" ON apfiscal.organization_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Ver membros da mesma organização" ON apfiscal.organization_members
  FOR SELECT USING (apfiscal.is_org_member(organization_id));

CREATE POLICY "Admins gerenciam membros" ON apfiscal.organization_members
  FOR ALL USING (apfiscal.has_org_role(organization_id, ARRAY['admin']::app_role[]))
  WITH CHECK (apfiscal.has_org_role(organization_id, ARRAY['admin']::app_role[]));

-- Permitir que um usuário se auto-insira quando ainda não é membro (ensure_user_organization já usa SECURITY DEFINER, mas mantemos consistência)
CREATE POLICY "Auto-inserção inicial de membro" ON apfiscal.organization_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- organizations
CREATE POLICY "Membros veem sua organização" ON apfiscal.organizations
  FOR SELECT USING (apfiscal.is_org_member(id));

-- companies
CREATE POLICY "Membros veem empresas da organização" ON apfiscal.companies
  FOR SELECT USING (apfiscal.is_org_member(organization_id));

CREATE POLICY "Admins e Financeiros gerenciam empresas" ON apfiscal.companies
  FOR ALL USING (apfiscal.has_org_role(organization_id, ARRAY['admin','financeiro']::app_role[]))
  WITH CHECK (apfiscal.has_org_role(organization_id, ARRAY['admin','financeiro']::app_role[]));

-- Source: 20260721170239_53b36858-2b1a-4f4f-8429-8e5f6b95c3a3.sql
-- Suppliers table (fornecedores) per company
CREATE TABLE apfiscal.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.suppliers TO authenticated;
GRANT ALL ON apfiscal.suppliers TO service_role;
ALTER TABLE apfiscal.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage suppliers"
  ON apfiscal.suppliers FOR ALL
  USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));

CREATE INDEX suppliers_company_idx ON apfiscal.suppliers(company_id);
CREATE INDEX suppliers_org_idx ON apfiscal.suppliers(organization_id);
CREATE INDEX suppliers_cnpj_idx ON apfiscal.suppliers(cnpj_cpf);

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON apfiscal.suppliers
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

-- Products table (produtos) per company
CREATE TABLE apfiscal.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
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
  supplier_id UUID REFERENCES apfiscal.suppliers(id) ON DELETE SET NULL,
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

GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.products TO authenticated;
GRANT ALL ON apfiscal.products TO service_role;
ALTER TABLE apfiscal.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage products"
  ON apfiscal.products FOR ALL
  USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));

CREATE INDEX products_company_idx ON apfiscal.products(company_id);
CREATE INDEX products_org_idx ON apfiscal.products(organization_id);
CREATE INDEX products_supplier_idx ON apfiscal.products(supplier_id);
CREATE INDEX products_codigo_idx ON apfiscal.products(codigo);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON apfiscal.products
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

-- Helper: upsert supplier from incoming NF-e emitente
CREATE OR REPLACE FUNCTION apfiscal.upsert_supplier_from_nfe(
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
SET search_path = apfiscal, public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO apfiscal.suppliers (
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
        nome_fantasia = COALESCE(EXCLUDED.nome_fantasia, apfiscal.suppliers.nome_fantasia),
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Helper: upsert product from NF-e item
CREATE OR REPLACE FUNCTION apfiscal.upsert_product_from_nfe(
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
SET search_path = apfiscal, public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO apfiscal.products (
    organization_id, company_id, codigo, descricao, ncm, cfop_padrao,
    unidade, ean, valor_unitario, supplier_id, origem
  ) VALUES (
    _organization_id, _company_id, _codigo, _descricao, _ncm, _cfop,
    _unidade, _ean, _valor_unitario, _supplier_id, 'auto_nfe'
  )
  ON CONFLICT (company_id, codigo) DO UPDATE
    SET descricao = EXCLUDED.descricao,
        ncm = COALESCE(EXCLUDED.ncm, apfiscal.products.ncm),
        valor_unitario = COALESCE(EXCLUDED.valor_unitario, apfiscal.products.valor_unitario),
        updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Source: 20260721191751_d30f2de0-599c-40b5-af5a-4754c82b90eb.sql
-- Restrict SECURITY DEFINER functions to appropriate callers
REVOKE EXECUTE ON FUNCTION apfiscal.upsert_supplier_from_nfe(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION apfiscal.upsert_product_from_nfe(uuid, uuid, text, text, text, text, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apfiscal.upsert_supplier_from_nfe(uuid, uuid, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION apfiscal.upsert_product_from_nfe(uuid, uuid, text, text, text, text, text, text, numeric, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION apfiscal.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apfiscal.has_org_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apfiscal.ensure_user_organization() FROM PUBLIC, anon;

-- Tighten notification_settings RLS to validate organization membership
DROP POLICY IF EXISTS "Usuários podem gerenciar suas configurações de notificação" ON apfiscal.notification_settings;

CREATE POLICY "Users manage their own notification settings"
  ON apfiscal.notification_settings
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (organization_id IS NULL OR apfiscal.is_org_member(organization_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (organization_id IS NULL OR apfiscal.is_org_member(organization_id))
  );

-- Source: 20260722185442_b35cdc42-2b98-4c6a-864c-514282d259b5.sql
-- 1) Catalog scope on organizations
ALTER TABLE apfiscal.organizations
  ADD COLUMN IF NOT EXISTS catalog_scope text NOT NULL DEFAULT 'per_company'
    CHECK (catalog_scope IN ('global','per_company'));

-- Allow org admins to update their organization settings
DROP POLICY IF EXISTS "Admins atualizam organização" ON apfiscal.organizations;
CREATE POLICY "Admins atualizam organização" ON apfiscal.organizations
  FOR UPDATE TO authenticated
  USING (has_org_role(id, ARRAY['admin']::app_role[]))
  WITH CHECK (has_org_role(id, ARRAY['admin']::app_role[]));

-- 2) Make company_id nullable on suppliers/products (null = global to org)
ALTER TABLE apfiscal.suppliers ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE apfiscal.products  ALTER COLUMN company_id DROP NOT NULL;

-- 3) Replace unique constraints with partial indexes that also cover global rows
ALTER TABLE apfiscal.suppliers DROP CONSTRAINT IF EXISTS suppliers_company_id_cnpj_cpf_key;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_cnpj_uidx
  ON apfiscal.suppliers (company_id, cnpj_cpf) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_org_global_cnpj_uidx
  ON apfiscal.suppliers (organization_id, cnpj_cpf) WHERE company_id IS NULL;

ALTER TABLE apfiscal.products DROP CONSTRAINT IF EXISTS products_company_id_codigo_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_company_codigo_uidx
  ON apfiscal.products (company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_org_global_codigo_uidx
  ON apfiscal.products (organization_id, codigo) WHERE company_id IS NULL;

-- Source: 20260722195732_cefb40a9-9fc7-49cd-b9f3-4fd73d43fcdc.sql
GRANT EXECUTE ON FUNCTION apfiscal.upsert_supplier_from_nfe(uuid, uuid, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION apfiscal.upsert_product_from_nfe(uuid, uuid, text, text, text, text, text, text, numeric, uuid) TO authenticated;

-- Source: 20260722201053_fd69edce-e4de-4908-b8c3-fea8626671ff.sql
CREATE POLICY "Membros podem inserir documentos fiscais" ON apfiscal.fiscal_documents FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM organization_members om JOIN companies c ON c.organization_id = om.organization_id WHERE c.id = fiscal_documents.company_id AND om.user_id = auth.uid()));
CREATE POLICY "Membros podem atualizar documentos fiscais" ON apfiscal.fiscal_documents FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM organization_members om JOIN companies c ON c.organization_id = om.organization_id WHERE c.id = fiscal_documents.company_id AND om.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM organization_members om JOIN companies c ON c.organization_id = om.organization_id WHERE c.id = fiscal_documents.company_id AND om.user_id = auth.uid()));
CREATE POLICY "Membros podem excluir documentos fiscais" ON apfiscal.fiscal_documents FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM organization_members om JOIN companies c ON c.organization_id = om.organization_id WHERE c.id = fiscal_documents.company_id AND om.user_id = auth.uid()));

-- Source: 20260722201742_ddf99600-bfd3-4a4c-bd38-66460173b2e1.sql
-- Expand fiscal_documents to hold complete NF-e payload
ALTER TABLE apfiscal.fiscal_documents
  ADD COLUMN IF NOT EXISTS xml_content text,
  ADD COLUMN IF NOT EXISTS destinatario_cnpj text,
  ADD COLUMN IF NOT EXISTS destinatario_nome text,
  ADD COLUMN IF NOT EXISTS natureza_operacao text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS tipo_operacao text,
  ADD COLUMN IF NOT EXISTS finalidade text,
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS data_autorizacao timestamptz,
  ADD COLUMN IF NOT EXISTS valor_produtos numeric,
  ADD COLUMN IF NOT EXISTS valor_frete numeric,
  ADD COLUMN IF NOT EXISTS valor_seguro numeric,
  ADD COLUMN IF NOT EXISTS valor_desconto numeric,
  ADD COLUMN IF NOT EXISTS valor_outros numeric,
  ADD COLUMN IF NOT EXISTS ide jsonb,
  ADD COLUMN IF NOT EXISTS emitente jsonb,
  ADD COLUMN IF NOT EXISTS destinatario jsonb,
  ADD COLUMN IF NOT EXISTS totais jsonb,
  ADD COLUMN IF NOT EXISTS transporte jsonb,
  ADD COLUMN IF NOT EXISTS cobranca jsonb,
  ADD COLUMN IF NOT EXISTS pagamentos jsonb,
  ADD COLUMN IF NOT EXISTS inf_adicional jsonb,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb;

-- Items table (one row per <det>)
CREATE TABLE IF NOT EXISTS apfiscal.fiscal_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES apfiscal.fiscal_documents(id) ON DELETE CASCADE,
  product_id uuid REFERENCES apfiscal.products(id) ON DELETE SET NULL,
  numero_item integer NOT NULL,
  codigo text,
  descricao text,
  ncm text,
  cest text,
  cfop text,
  unidade_comercial text,
  quantidade_comercial numeric,
  valor_unitario_comercial numeric,
  valor_bruto numeric,
  unidade_tributavel text,
  quantidade_tributavel numeric,
  valor_unitario_tributavel numeric,
  ean text,
  ean_tributavel text,
  valor_frete numeric,
  valor_seguro numeric,
  valor_desconto numeric,
  valor_outros numeric,
  valor_total numeric,
  produto jsonb,
  impostos jsonb,
  inf_adicional text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_document_items_document_id_idx ON apfiscal.fiscal_document_items(document_id);
CREATE INDEX IF NOT EXISTS fiscal_document_items_product_id_idx ON apfiscal.fiscal_document_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.fiscal_document_items TO authenticated;
GRANT ALL ON apfiscal.fiscal_document_items TO service_role;

ALTER TABLE apfiscal.fiscal_document_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view items of their org documents"
  ON apfiscal.fiscal_document_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can insert items on their org documents"
  ON apfiscal.fiscal_document_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can update items on their org documents"
  ON apfiscal.fiscal_document_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can delete items on their org documents"
  ON apfiscal.fiscal_document_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

-- Events table (protocolos, cancelamentos, cartas de correção, manifestações)
CREATE TABLE IF NOT EXISTS apfiscal.fiscal_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES apfiscal.fiscal_documents(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  codigo_evento text,
  descricao text,
  protocolo text,
  data_evento timestamptz,
  sequencia integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_document_events_document_id_idx ON apfiscal.fiscal_document_events(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.fiscal_document_events TO authenticated;
GRANT ALL ON apfiscal.fiscal_document_events TO service_role;

ALTER TABLE apfiscal.fiscal_document_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view events of their org documents"
  ON apfiscal.fiscal_document_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can insert events on their org documents"
  ON apfiscal.fiscal_document_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can update events on their org documents"
  ON apfiscal.fiscal_document_events FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can delete events on their org documents"
  ON apfiscal.fiscal_document_events FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents fd
    JOIN apfiscal.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND apfiscal.is_org_member(c.organization_id)
  ));

-- Source: 20260722202416_9d2dd182-a3d5-4304-8766-12364b92161f.sql
-- Deduplicate products before creating the unique index (keep oldest)
DELETE FROM apfiscal.products p
USING apfiscal.products p2
WHERE p.company_id IS NOT DISTINCT FROM p2.company_id
  AND p.codigo = p2.codigo
  AND p.created_at > p2.created_at;

DELETE FROM apfiscal.suppliers s
USING apfiscal.suppliers s2
WHERE s.company_id IS NOT DISTINCT FROM s2.company_id
  AND s.cnpj_cpf = s2.cnpj_cpf
  AND s.created_at > s2.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_codigo_key
  ON apfiscal.products(company_id, codigo);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_company_cnpjcpf_key
  ON apfiscal.suppliers(company_id, cnpj_cpf);

-- Source: 20260723135517_4153bef4-85e5-4913-aa92-8ef3304df81f.sql
CREATE TABLE apfiscal.familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.familias TO authenticated;
GRANT ALL ON apfiscal.familias TO service_role;
ALTER TABLE apfiscal.familias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage familias" ON apfiscal.familias
  FOR ALL USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));
CREATE UNIQUE INDEX familias_company_codigo_uidx ON apfiscal.familias(company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX familias_org_global_codigo_uidx ON apfiscal.familias(organization_id, codigo) WHERE company_id IS NULL;
CREATE INDEX familias_org_idx ON apfiscal.familias(organization_id);
CREATE TRIGGER update_familias_updated_at BEFORE UPDATE ON apfiscal.familias
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

CREATE TABLE apfiscal.grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.grupos TO authenticated;
GRANT ALL ON apfiscal.grupos TO service_role;
ALTER TABLE apfiscal.grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage grupos" ON apfiscal.grupos
  FOR ALL USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));
CREATE UNIQUE INDEX grupos_company_codigo_uidx ON apfiscal.grupos(company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX grupos_org_global_codigo_uidx ON apfiscal.grupos(organization_id, codigo) WHERE company_id IS NULL;
CREATE INDEX grupos_org_idx ON apfiscal.grupos(organization_id);
CREATE TRIGGER update_grupos_updated_at BEFORE UPDATE ON apfiscal.grupos
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

CREATE TABLE apfiscal.subgrupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.subgrupos TO authenticated;
GRANT ALL ON apfiscal.subgrupos TO service_role;
ALTER TABLE apfiscal.subgrupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage subgrupos" ON apfiscal.subgrupos
  FOR ALL USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));
CREATE UNIQUE INDEX subgrupos_company_codigo_uidx ON apfiscal.subgrupos(company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX subgrupos_org_global_codigo_uidx ON apfiscal.subgrupos(organization_id, codigo) WHERE company_id IS NULL;
CREATE INDEX subgrupos_org_idx ON apfiscal.subgrupos(organization_id);
CREATE TRIGGER update_subgrupos_updated_at BEFORE UPDATE ON apfiscal.subgrupos
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

CREATE TABLE apfiscal.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  codigo_interno text NOT NULL,
  descricao text NOT NULL,
  unidade text NOT NULL,
  ean_gtin text,
  ncm text NOT NULL,
  cest text,
  origem_mercadoria smallint NOT NULL DEFAULT 0 CHECK (origem_mercadoria BETWEEN 0 AND 8),
  familia_id uuid REFERENCES apfiscal.familias(id) ON DELETE SET NULL,
  grupo_id uuid REFERENCES apfiscal.grupos(id) ON DELETE SET NULL,
  subgrupo_id uuid REFERENCES apfiscal.subgrupos(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.produtos TO authenticated;
GRANT ALL ON apfiscal.produtos TO service_role;
ALTER TABLE apfiscal.produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage produtos" ON apfiscal.produtos
  FOR ALL USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));
CREATE UNIQUE INDEX produtos_company_codigo_uidx ON apfiscal.produtos(company_id, codigo_interno) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX produtos_org_global_codigo_uidx ON apfiscal.produtos(organization_id, codigo_interno) WHERE company_id IS NULL;
CREATE INDEX produtos_org_idx ON apfiscal.produtos(organization_id);
CREATE INDEX produtos_company_idx ON apfiscal.produtos(company_id);
CREATE INDEX produtos_familia_idx ON apfiscal.produtos(familia_id);
CREATE INDEX produtos_grupo_idx ON apfiscal.produtos(grupo_id);
CREATE INDEX produtos_subgrupo_idx ON apfiscal.produtos(subgrupo_id);
CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON apfiscal.produtos
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

CREATE TABLE apfiscal.produtos_fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES apfiscal.produtos(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES apfiscal.suppliers(id) ON DELETE CASCADE,
  codigo_item_nota text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.produtos_fornecedores TO authenticated;
GRANT ALL ON apfiscal.produtos_fornecedores TO service_role;
ALTER TABLE apfiscal.produtos_fornecedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members manage produtos_fornecedores" ON apfiscal.produtos_fornecedores
  FOR ALL USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));
CREATE UNIQUE INDEX produtos_forn_company_codigo_uidx
  ON apfiscal.produtos_fornecedores(empresa_id, fornecedor_id, codigo_item_nota)
  WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX produtos_forn_org_global_codigo_uidx
  ON apfiscal.produtos_fornecedores(organization_id, fornecedor_id, codigo_item_nota)
  WHERE empresa_id IS NULL;
CREATE INDEX produtos_forn_produto_idx ON apfiscal.produtos_fornecedores(produto_id);
CREATE INDEX produtos_forn_fornecedor_idx ON apfiscal.produtos_fornecedores(fornecedor_id);
CREATE INDEX produtos_forn_org_idx ON apfiscal.produtos_fornecedores(organization_id);
CREATE TRIGGER update_produtos_fornecedores_updated_at BEFORE UPDATE ON apfiscal.produtos_fornecedores
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

ALTER TABLE apfiscal.fiscal_document_items
  ADD COLUMN IF NOT EXISTS status_vinculo text NOT NULL DEFAULT 'pendente'
  CHECK (status_vinculo IN ('vinculado', 'pendente', 'ignorado'));

-- Drop FK before repointing so we can move product_id to produtos ids
ALTER TABLE apfiscal.fiscal_document_items DROP CONSTRAINT IF EXISTS fiscal_document_items_product_id_fkey;

CREATE TEMP TABLE _prod_map ON COMMIT DROP AS
SELECT id AS old_id, gen_random_uuid() AS new_id FROM apfiscal.products;

INSERT INTO apfiscal.produtos (
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
FROM apfiscal.products p
JOIN _prod_map m ON m.old_id = p.id;

UPDATE apfiscal.fiscal_document_items fdi
SET product_id = m.new_id
FROM _prod_map m
WHERE fdi.product_id = m.old_id;

INSERT INTO apfiscal.produtos_fornecedores (organization_id, empresa_id, produto_id, fornecedor_id, codigo_item_nota)
SELECT DISTINCT ON (p.organization_id, p.company_id, p.supplier_id, p.codigo)
  p.organization_id, p.company_id, m.new_id, p.supplier_id, p.codigo
FROM apfiscal.products p
JOIN _prod_map m ON m.old_id = p.id
WHERE p.supplier_id IS NOT NULL;

UPDATE apfiscal.fiscal_document_items
SET status_vinculo = 'vinculado'
WHERE product_id IS NOT NULL;

DROP FUNCTION IF EXISTS apfiscal.upsert_product_from_nfe(uuid, uuid, text, text, text, text, text, text, numeric, uuid);
DROP TABLE apfiscal.products;

-- Re-add FK pointing to produtos
ALTER TABLE apfiscal.fiscal_document_items
  ADD CONSTRAINT fiscal_document_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES apfiscal.produtos(id) ON DELETE SET NULL;

-- Source: 20260724182708_0b4dd03a-dc33-46ff-831b-a6078a1b66c5.sql
CREATE TABLE apfiscal.centros_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT centros_custo_codigo_formato CHECK (codigo ~ '^[0-9]{2}\.[0-9]{4}$'),
  CONSTRAINT centros_custo_codigo_empresa_unico UNIQUE (company_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.centros_custo TO authenticated;
GRANT ALL ON apfiscal.centros_custo TO service_role;
ALTER TABLE apfiscal.centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centros_custo_org_members_all" ON apfiscal.centros_custo
  FOR ALL TO authenticated
  USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));
CREATE TRIGGER trg_centros_custo_updated_at
  BEFORE UPDATE ON apfiscal.centros_custo
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();
CREATE INDEX idx_centros_custo_company ON apfiscal.centros_custo(company_id);

CREATE TABLE apfiscal.plano_contas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  conta_pai_id UUID REFERENCES apfiscal.plano_contas(id) ON DELETE RESTRICT,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  permite_lancamentos BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plano_contas_codigo_formato CHECK (
    codigo ~ '^[0-9]{2}$'
    OR codigo ~ '^[0-9]{2}\.[0-9]{3}$'
    OR codigo ~ '^[0-9]{2}\.[0-9]{3}\.[0-9]{4}$'
  ),
  CONSTRAINT plano_contas_codigo_empresa_unico UNIQUE (company_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.plano_contas TO authenticated;
GRANT ALL ON apfiscal.plano_contas TO service_role;
ALTER TABLE apfiscal.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plano_contas_org_members_all" ON apfiscal.plano_contas
  FOR ALL TO authenticated
  USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));
CREATE TRIGGER trg_plano_contas_updated_at
  BEFORE UPDATE ON apfiscal.plano_contas
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();
CREATE INDEX idx_plano_contas_company ON apfiscal.plano_contas(company_id);
CREATE INDEX idx_plano_contas_pai ON apfiscal.plano_contas(conta_pai_id);

CREATE OR REPLACE FUNCTION apfiscal.plano_contas_sync_permite_lanc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = apfiscal, public, extensions AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.conta_pai_id IS NOT NULL THEN
    UPDATE apfiscal.plano_contas
      SET permite_lancamentos = false
      WHERE id = NEW.conta_pai_id AND permite_lancamentos = true;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_plano_contas_sync_pai
  AFTER INSERT OR UPDATE OF conta_pai_id ON apfiscal.plano_contas
  FOR EACH ROW EXECUTE FUNCTION apfiscal.plano_contas_sync_permite_lanc();

ALTER TABLE apfiscal.fiscal_documents
  ADD COLUMN IF NOT EXISTS plano_contas_id UUID REFERENCES apfiscal.plano_contas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_plano_contas ON apfiscal.fiscal_documents(plano_contas_id);

ALTER TABLE apfiscal.fiscal_document_items
  ADD COLUMN IF NOT EXISTS plano_contas_id UUID REFERENCES apfiscal.plano_contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plano_contas_alterado_manualmente BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_fiscal_document_items_plano_contas ON apfiscal.fiscal_document_items(plano_contas_id);

CREATE TABLE apfiscal.nfe_centro_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES apfiscal.fiscal_documents(id) ON DELETE CASCADE,
  centro_custo_id UUID NOT NULL REFERENCES apfiscal.centros_custo(id) ON DELETE RESTRICT,
  valor NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nfe_centro_custo_doc_cc_unico UNIQUE (document_id, centro_custo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.nfe_centro_custo TO authenticated;
GRANT ALL ON apfiscal.nfe_centro_custo TO service_role;
ALTER TABLE apfiscal.nfe_centro_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfe_cc_org_members_all" ON apfiscal.nfe_centro_custo
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents d
    JOIN apfiscal.companies c ON c.id = d.company_id
    WHERE d.id = document_id AND apfiscal.is_org_member(c.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_documents d
    JOIN apfiscal.companies c ON c.id = d.company_id
    WHERE d.id = document_id AND apfiscal.is_org_member(c.organization_id)
  ));
CREATE TRIGGER trg_nfe_cc_updated_at
  BEFORE UPDATE ON apfiscal.nfe_centro_custo
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();
CREATE INDEX idx_nfe_cc_document ON apfiscal.nfe_centro_custo(document_id);

CREATE TABLE apfiscal.nfe_item_centro_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_item_id UUID NOT NULL REFERENCES apfiscal.fiscal_document_items(id) ON DELETE CASCADE,
  centro_custo_id UUID NOT NULL REFERENCES apfiscal.centros_custo(id) ON DELETE RESTRICT,
  valor NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nfe_item_cc_item_cc_unico UNIQUE (document_item_id, centro_custo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.nfe_item_centro_custo TO authenticated;
GRANT ALL ON apfiscal.nfe_item_centro_custo TO service_role;
ALTER TABLE apfiscal.nfe_item_centro_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfe_item_cc_org_members_all" ON apfiscal.nfe_item_centro_custo
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_document_items i
    JOIN apfiscal.fiscal_documents d ON d.id = i.document_id
    JOIN apfiscal.companies c ON c.id = d.company_id
    WHERE i.id = document_item_id AND apfiscal.is_org_member(c.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM apfiscal.fiscal_document_items i
    JOIN apfiscal.fiscal_documents d ON d.id = i.document_id
    JOIN apfiscal.companies c ON c.id = d.company_id
    WHERE i.id = document_item_id AND apfiscal.is_org_member(c.organization_id)
  ));
CREATE TRIGGER trg_nfe_item_cc_updated_at
  BEFORE UPDATE ON apfiscal.nfe_item_centro_custo
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();
CREATE INDEX idx_nfe_item_cc_item ON apfiscal.nfe_item_centro_custo(document_item_id);

CREATE OR REPLACE FUNCTION apfiscal.check_item_cc_soma()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = apfiscal, public, extensions AS $$
DECLARE
  v_total_item NUMERIC(15,2);
  v_soma NUMERIC(15,2);
  v_item UUID;
BEGIN
  v_item := COALESCE(NEW.document_item_id, OLD.document_item_id);
  SELECT COALESCE(valor_bruto, 0) INTO v_total_item
    FROM apfiscal.fiscal_document_items WHERE id = v_item;
  SELECT COALESCE(SUM(valor), 0) INTO v_soma
    FROM apfiscal.nfe_item_centro_custo WHERE document_item_id = v_item;
  IF v_soma > v_total_item + 0.005 THEN
    RAISE EXCEPTION 'Soma dos centros de custo (R$ %) excede o valor do item (R$ %)', v_soma, v_total_item;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_check_item_cc_soma
  AFTER INSERT OR UPDATE OF valor ON apfiscal.nfe_item_centro_custo
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION apfiscal.check_item_cc_soma();

CREATE OR REPLACE FUNCTION apfiscal.check_doc_cc_soma()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = apfiscal, public, extensions AS $$
DECLARE
  v_total NUMERIC(15,2);
  v_soma NUMERIC(15,2);
  v_doc UUID;
BEGIN
  v_doc := COALESCE(NEW.document_id, OLD.document_id);
  SELECT COALESCE(valor_total, 0) INTO v_total
    FROM apfiscal.fiscal_documents WHERE id = v_doc;
  SELECT COALESCE(SUM(valor), 0) INTO v_soma
    FROM apfiscal.nfe_centro_custo WHERE document_id = v_doc;
  IF v_soma > v_total + 0.005 THEN
    RAISE EXCEPTION 'Soma dos centros de custo (R$ %) excede o valor total da NF-e (R$ %)', v_soma, v_total;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_check_doc_cc_soma
  AFTER INSERT OR UPDATE OF valor ON apfiscal.nfe_centro_custo
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION apfiscal.check_doc_cc_soma();

-- Source: 20260727130836_9aa9bdef-9380-4b74-aec4-15bd6d2784e6.sql
ALTER TABLE apfiscal.centros_custo ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE apfiscal.plano_contas ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE apfiscal.centros_custo DROP CONSTRAINT IF EXISTS centros_custo_codigo_empresa_unico;
ALTER TABLE apfiscal.plano_contas DROP CONSTRAINT IF EXISTS plano_contas_codigo_empresa_unico;
DROP INDEX IF EXISTS apfiscal.centros_custo_codigo_empresa_unico;
DROP INDEX IF EXISTS apfiscal.plano_contas_codigo_empresa_unico;

CREATE UNIQUE INDEX centros_custo_codigo_empresa_unico
  ON apfiscal.centros_custo (company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX centros_custo_codigo_global_unico
  ON apfiscal.centros_custo (organization_id, codigo) WHERE company_id IS NULL;

CREATE UNIQUE INDEX plano_contas_codigo_empresa_unico
  ON apfiscal.plano_contas (company_id, codigo) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX plano_contas_codigo_global_unico
  ON apfiscal.plano_contas (organization_id, codigo) WHERE company_id IS NULL;

-- Source: 20260727135642_64237d5c-06f6-4724-a1af-58780e24d47b.sql
ALTER TABLE apfiscal.centros_custo DROP CONSTRAINT IF EXISTS centros_custo_codigo_formato;
ALTER TABLE apfiscal.centros_custo ADD CONSTRAINT centros_custo_codigo_formato CHECK (codigo ~ '^[0-9]{2}(\.[0-9]{4})?$');

-- Source: 20260727142227_626e0a17-a4ef-416e-8704-0e24d2fc80fc.sql
CREATE TYPE apfiscal.doc_integracao_status AS ENUM ('resumida','manifestacao_pendente','aguardando_xml_completo','completa','erro');

CREATE TABLE apfiscal.empresa_integracoes_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL UNIQUE REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  api_key_encrypted text,
  api_key_last4 text,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_nsu bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON apfiscal.empresa_integracoes_fiscais TO service_role;
ALTER TABLE apfiscal.empresa_integracoes_fiscais ENABLE ROW LEVEL SECURITY;

CREATE TABLE apfiscal.documentos_fiscais_integracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  nsu bigint NOT NULL,
  chave text NOT NULL,
  tipo_documento text,
  emitente_cnpj text,
  emitente_nome text,
  emitente_ie text,
  data_emissao timestamptz,
  valor_nota numeric(15,2),
  protocolo text,
  status apfiscal.doc_integracao_status NOT NULL DEFAULT 'resumida',
  xml_resumido_path text,
  xml_completo_path text,
  tentativas_xml_completo integer NOT NULL DEFAULT 0,
  mensagem_sefaz text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chave)
);
CREATE INDEX idx_dfi_company_nsu ON apfiscal.documentos_fiscais_integracao (company_id, nsu);
CREATE INDEX idx_dfi_status ON apfiscal.documentos_fiscais_integracao (status);
GRANT SELECT ON apfiscal.documentos_fiscais_integracao TO authenticated;
GRANT ALL ON apfiscal.documentos_fiscais_integracao TO service_role;
ALTER TABLE apfiscal.documentos_fiscais_integracao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view integration documents"
  ON apfiscal.documentos_fiscais_integracao FOR SELECT TO authenticated
  USING (apfiscal.is_org_member(organization_id));

CREATE TABLE apfiscal.historico_integracao_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES apfiscal.documentos_fiscais_integracao(id) ON DELETE SET NULL,
  acao text NOT NULL,
  status_http integer,
  sucesso boolean NOT NULL DEFAULT true,
  mensagem text,
  payload_bruto jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hif_company_created ON apfiscal.historico_integracao_fiscal (company_id, created_at DESC);
GRANT SELECT ON apfiscal.historico_integracao_fiscal TO authenticated;
GRANT ALL ON apfiscal.historico_integracao_fiscal TO service_role;
ALTER TABLE apfiscal.historico_integracao_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view integration history"
  ON apfiscal.historico_integracao_fiscal FOR SELECT TO authenticated
  USING (apfiscal.is_org_member(organization_id));

CREATE TRIGGER trg_efi_updated BEFORE UPDATE ON apfiscal.empresa_integracoes_fiscais
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();
CREATE TRIGGER trg_dfi_updated BEFORE UPDATE ON apfiscal.documentos_fiscais_integracao
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

-- Source: 20260727144223_629a6ba2-ec75-4af0-bd04-5272b60c9551.sql
ALTER TABLE apfiscal.empresa_integracoes_fiscais ADD COLUMN IF NOT EXISTS base_url text;

-- Source: 20260727170543_17b5f675-b808-4768-9f9b-3f9654001eee.sql
CREATE TABLE apfiscal.locais_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES apfiscal.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  tipo text NOT NULL DEFAULT 'sintetico',
  codigo_pai_id uuid REFERENCES apfiscal.locais_estoque(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locais_estoque_codigo_formato CHECK (codigo ~ '^\d{2}$' OR codigo ~ '^\d{2}\.\d{3}$'),
  CONSTRAINT locais_estoque_tipo_chk CHECK (tipo IN ('sintetico','analitico'))
);

CREATE UNIQUE INDEX locais_estoque_codigo_company_uidx
  ON apfiscal.locais_estoque (organization_id, company_id, codigo)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX locais_estoque_codigo_global_uidx
  ON apfiscal.locais_estoque (organization_id, codigo)
  WHERE company_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON apfiscal.locais_estoque TO authenticated;
GRANT ALL ON apfiscal.locais_estoque TO service_role;

ALTER TABLE apfiscal.locais_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY locais_estoque_org_members_all ON apfiscal.locais_estoque
  FOR ALL TO authenticated
  USING (apfiscal.is_org_member(organization_id))
  WITH CHECK (apfiscal.is_org_member(organization_id));

CREATE TRIGGER update_locais_estoque_updated_at
  BEFORE UPDATE ON apfiscal.locais_estoque
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

-- Source: 20260727171906_921d56dd-4d8f-4d51-a960-c5239f66a41c.sql
ALTER TABLE apfiscal.fiscal_documents
  ADD COLUMN IF NOT EXISTS local_estoque_id uuid REFERENCES apfiscal.locais_estoque(id) ON DELETE SET NULL;

ALTER TABLE apfiscal.fiscal_document_items
  ADD COLUMN IF NOT EXISTS local_estoque_id uuid REFERENCES apfiscal.locais_estoque(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS local_estoque_alterado_manualmente boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_fiscal_document_items_local_estoque ON apfiscal.fiscal_document_items(local_estoque_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_local_estoque ON apfiscal.fiscal_documents(local_estoque_id);

-- Source: 20260728171112_8ceb6408-5614-4fa3-9217-85d2fdc3df6c.sql
CREATE TYPE apfiscal.nfe_status AS ENUM ('pendente_confirmacao','aprovada','pronta_para_integracao','integrado_totvs');

ALTER TABLE apfiscal.fiscal_documents
  ADD COLUMN status apfiscal.nfe_status NOT NULL DEFAULT 'pendente_confirmacao',
  ADD COLUMN status_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN status_updated_by uuid,
  ADD COLUMN status_observacao text;

COMMENT ON COLUMN apfiscal.fiscal_documents.status_manifestacao IS 'DEPRECATED: substituido por apfiscal.fiscal_documents.status (enum nfe_status)';

CREATE TABLE apfiscal.nfe_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nfe_id uuid NOT NULL REFERENCES apfiscal.fiscal_documents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES apfiscal.companies(id) ON DELETE CASCADE,
  status_anterior apfiscal.nfe_status,
  status_novo apfiscal.nfe_status NOT NULL,
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  observacao text
);

GRANT SELECT ON apfiscal.nfe_status_historico TO authenticated;
GRANT ALL ON apfiscal.nfe_status_historico TO service_role;

ALTER TABLE apfiscal.nfe_status_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem historico de status"
  ON apfiscal.nfe_status_historico FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM apfiscal.companies c WHERE c.id = nfe_status_historico.company_id AND apfiscal.is_org_member(c.organization_id)));

CREATE POLICY "Historico somente via trigger"
  ON apfiscal.nfe_status_historico FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE INDEX idx_nfe_status_historico_nfe ON apfiscal.nfe_status_historico(nfe_id, alterado_em DESC);

CREATE OR REPLACE FUNCTION apfiscal.fn_log_nfe_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = apfiscal, public, extensions
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at := now();
    INSERT INTO apfiscal.nfe_status_historico (nfe_id, company_id, status_anterior, status_novo, alterado_por, observacao)
    VALUES (NEW.id, NEW.company_id, OLD.status, NEW.status, COALESCE(NEW.status_updated_by, auth.uid()), NEW.status_observacao);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_nfe_status_change
  BEFORE UPDATE ON apfiscal.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION apfiscal.fn_log_nfe_status_change();

CREATE OR REPLACE FUNCTION apfiscal.fn_log_nfe_status_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = apfiscal, public, extensions
AS $$
BEGIN
  INSERT INTO apfiscal.nfe_status_historico (nfe_id, company_id, status_anterior, status_novo, alterado_por, observacao)
  VALUES (NEW.id, NEW.company_id, NULL, NEW.status, COALESCE(NEW.status_updated_by, auth.uid()), COALESCE(NEW.status_observacao, 'NF-e importada'));
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_nfe_status_insert
  AFTER INSERT ON apfiscal.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION apfiscal.fn_log_nfe_status_insert();

-- Source: 20260729194127_53b9266e-b82c-4e91-8658-2424335e16dc.sql
CREATE TABLE apfiscal.tipos_compra (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON apfiscal.tipos_compra TO authenticated;
GRANT ALL ON apfiscal.tipos_compra TO service_role;

ALTER TABLE apfiscal.tipos_compra ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tipos de compra visiveis para autenticados"
  ON apfiscal.tipos_compra FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_tipos_compra_updated_at
  BEFORE UPDATE ON apfiscal.tipos_compra
  FOR EACH ROW EXECUTE FUNCTION apfiscal.update_updated_at_column();

INSERT INTO apfiscal.tipos_compra (codigo, descricao) VALUES
  ('00', 'Mercadoria para Revenda'),
  ('01', 'Matéria-Prima'),
  ('02', 'Embalagem'),
  ('03', 'Produto em Processo'),
  ('04', 'Produto Acabado'),
  ('05', 'Subproduto'),
  ('06', 'Produto Intermediário'),
  ('07', 'Material de Uso e Consumo'),
  ('08', 'Ativo Imobilizado'),
  ('09', 'Serviços'),
  ('10', 'Outros Insumos'),
  ('99', 'Outras (para itens que não se encaixam nos anteriores)');

ALTER TABLE apfiscal.fiscal_documents
  ADD COLUMN tipo_compra_id uuid REFERENCES apfiscal.tipos_compra(id);

ALTER TABLE apfiscal.fiscal_document_items
  ADD COLUMN tipo_compra_id uuid REFERENCES apfiscal.tipos_compra(id),
  ADD COLUMN tipo_compra_alterado_manualmente boolean NOT NULL DEFAULT false,
  ADD COLUMN apontado_por uuid,
  ADD COLUMN apontado_em timestamp with time zone;

CREATE INDEX idx_fiscal_document_items_tipo_compra ON apfiscal.fiscal_document_items(tipo_compra_id);

-- Source: 20260730192042_8ebcf392-fe6b-4f1e-bf95-6eb36b8b4ed5.sql
ALTER TABLE apfiscal.empresa_integracoes_fiscais
  ADD COLUMN IF NOT EXISTS apfiscal_empresa_id integer,
  ADD COLUMN IF NOT EXISTS apfiscal_system_unit_id integer,
  ADD COLUMN IF NOT EXISTS certificado_validade_inicio timestamptz,
  ADD COLUMN IF NOT EXISTS certificado_validade_fim timestamptz,
  ADD COLUMN IF NOT EXISTS certificado_dias_restantes integer,
  ADD COLUMN IF NOT EXISTS certificado_vencido boolean,
  ADD COLUMN IF NOT EXISTS certificado_arquivo_path text,
  ADD COLUMN IF NOT EXISTS certificado_atualizado_em timestamptz;

-- Source: 20260820141405_apfiscal_schema_rbac_providers.sql
-- Remodelação conservadora do domínio APFiscal.
-- ALTER ... SET SCHEMA preserva OIDs, dados, FKs, índices, triggers e policies.
create schema if not exists apfiscal;

do $$
declare
  object_name text;
  domain_tables constant text[] := array[
    'organizations','organization_members','companies','company_access','digital_certificates',
    'fiscal_documents','fiscal_document_items','fiscal_document_events','manifestations',
    'notifications','notification_settings','audit_logs','api_keys','suppliers','products',
    'familias','grupos','subgrupos','produtos','produtos_fornecedores','centros_custo',
    'plano_contas','nfe_centro_custo','nfe_item_centro_custo','empresa_integracoes_fiscais',
    'documentos_fiscais_integracao','historico_integracao_fiscal','locais_estoque',
    'nfe_status_historico','tipos_compra'
  ];
begin
  foreach object_name in array domain_tables loop
    if to_regclass(format('apfiscal.%I', object_name)) is not null
       and to_regclass(format('apfiscal.%I', object_name)) is null then
      execute format('alter table apfiscal.%I set schema apfiscal', object_name);
    end if;
  end loop;
end $$;

do $$
declare
  object_name text;
begin
  foreach object_name in array array['app_role','document_type','nfe_status','doc_integracao_status'] loop
    if exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = object_name
    ) and not exists (
      select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'apfiscal' and t.typname = object_name
    ) then
      execute format('alter type apfiscal.%I set schema apfiscal', object_name);
    end if;
  end loop;
end $$;

-- Funções legadas seguem o domínio para que RPCs antigas continuem no mesmo schema das tabelas.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'update_updated_at_column','ensure_user_organization','is_org_member','has_org_role',
        'upsert_supplier_from_nfe','upsert_product_from_nfe','plano_contas_sync_permite_lanc',
        'check_item_cc_soma','check_doc_cc_soma','fn_log_nfe_status_change','fn_log_nfe_status_insert'
      ])
  loop
    execute format('alter function %s set schema apfiscal', fn.signature);
  end loop;
end $$;

-- Funções PL/pgSQL armazenam referências qualificadas como texto; reescreva-as
-- depois do SET SCHEMA para que continuem apontando ao mesmo domínio.
do $$
declare
  fn record;
  definition text;
begin
  for fn in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'apfiscal'
      and p.proname = any(array[
        'update_updated_at_column','ensure_user_organization','is_org_member','has_org_role',
        'upsert_supplier_from_nfe','upsert_product_from_nfe','plano_contas_sync_permite_lanc',
        'check_item_cc_soma','check_doc_cc_soma','fn_log_nfe_status_change','fn_log_nfe_status_insert'
      ])
  loop
    definition := replace(pg_get_functiondef(fn.oid), 'apfiscal.', 'apfiscal.');
    execute definition;
    execute format('alter function %s set search_path = apfiscal, public, pg_temp', fn.signature);
  end loop;
end $$;

create table if not exists apfiscal.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into apfiscal.users (id, email, full_name)
select auth_user.id, coalesce(auth_user.email, ''), coalesce(auth_user.raw_user_meta_data ->> 'full_name', auth_user.raw_user_meta_data ->> 'name')
from auth.users auth_user
where auth_user.raw_user_meta_data ->> 'app' = 'apfiscal'
   or exists (select 1 from apfiscal.organization_members member where member.user_id = auth_user.id)
on conflict (id) do update set email = excluded.email;

create table if not exists apfiscal.permissions (
  key text primary key check (key ~ '^[a-z0-9_.]+$'),
  module text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists apfiscal.access_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references apfiscal.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  description text,
  active boolean not null default true,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists access_profiles_org_name_uidx
  on apfiscal.access_profiles (organization_id, lower(name));

create table if not exists apfiscal.profile_permissions (
  profile_id uuid not null references apfiscal.access_profiles(id) on delete cascade,
  permission_key text not null references apfiscal.permissions(key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, permission_key)
);

alter table apfiscal.organization_members
  add column if not exists profile_id uuid references apfiscal.access_profiles(id) on delete restrict,
  add column if not exists active boolean not null default true;
create unique index if not exists organization_members_org_user_uidx on apfiscal.organization_members(organization_id, user_id);
create unique index if not exists company_access_user_company_uidx on apfiscal.company_access(user_id, company_id);

insert into apfiscal.permissions (key, module, action, description) values
('dashboard.view','Dashboard','view','Visualizar dashboard e indicadores'),
('companies.view','Empresas','view','Visualizar empresas'),('companies.manage','Empresas','manage','Criar e editar empresas'),
('suppliers.view','Fornecedores','view','Visualizar fornecedores'),('suppliers.manage','Fornecedores','manage','Gerenciar fornecedores'),
('products.view','Produtos','view','Visualizar produtos'),('products.manage','Produtos','manage','Gerenciar produtos e vínculos'),
('classifications.view','Classificações','view','Visualizar classificações'),('classifications.manage','Classificações','manage','Gerenciar classificações'),
('documents.nfe.view','NF-e','view','Visualizar NF-e'),('documents.nfe.manage','NF-e','manage','Gerenciar NF-e'),
('documents.nfe.approve','NF-e','approve','Aprovar NF-e'),('documents.nfe.link_products','NF-e','link_products','Vincular produtos aos itens'),
('documents.nfse.view','NFS-e','view','Visualizar NFS-e'),('documents.nfse.manage','NFS-e','manage','Gerenciar NFS-e'),
('documents.cte.view','CT-e','view','Visualizar CT-e'),('documents.cte.manage','CT-e','manage','Gerenciar CT-e'),
('nfe.integration.view','Integração NF-e','view','Visualizar integração fiscal'),('nfe.integration.manage','Integração NF-e','manage','Configurar e executar integração fiscal'),
('monitoring.view','Monitoramento','view','Visualizar monitoramento'),
('notifications.view','Notificações','view','Visualizar notificações'),('notifications.manage','Notificações','manage','Gerenciar notificações'),
('finance.cost_centers.view','Centros de custo','view','Visualizar centros de custo'),('finance.cost_centers.manage','Centros de custo','manage','Gerenciar centros de custo e rateios'),
('finance.chart_accounts.view','Plano de contas','view','Visualizar plano de contas'),('finance.chart_accounts.manage','Plano de contas','manage','Gerenciar plano de contas'),
('finance.stock_locations.view','Locais de estoque','view','Visualizar locais de estoque'),('finance.stock_locations.manage','Locais de estoque','manage','Gerenciar locais de estoque'),
('settings.general.view','Configurações','view','Visualizar configurações'),('settings.general.manage','Configurações','manage','Gerenciar configurações'),
('settings.users.view','Usuários','view','Visualizar usuários'),('settings.users.manage','Usuários','manage','Convidar e gerenciar usuários'),
('settings.profiles.view','Perfis','view','Visualizar perfis de acesso'),('settings.profiles.manage','Perfis','manage','Gerenciar perfis e permissões'),
('settings.api_keys.view','API Keys','view','Visualizar API keys'),('settings.api_keys.manage','API Keys','manage','Gerenciar API keys')
on conflict (key) do update set module = excluded.module, action = excluded.action, description = excluded.description;

insert into apfiscal.access_profiles (organization_id, name, description, active, is_system)
select o.id, 'Administrador', 'Acesso completo à organização.', true, true
from apfiscal.organizations o
on conflict (organization_id, (lower(name))) do update set active = true, is_system = true;

insert into apfiscal.profile_permissions (profile_id, permission_key)
select p.id, permission.key
from apfiscal.access_profiles p cross join apfiscal.permissions permission
where p.name = 'Administrador'
on conflict do nothing;

update apfiscal.organization_members member
set profile_id = profile.id
from apfiscal.access_profiles profile
where profile.organization_id = member.organization_id
  and profile.name = 'Administrador'
  and member.role = 'admin'
  and member.profile_id is null;

-- Configuração canônica de provider e checkpoint único por empresa/CNPJ.
alter table apfiscal.empresa_integracoes_fiscais
  add column if not exists primary_provider text not null default 'nfewizard' check (primary_provider in ('nfewizard','apifiscal')),
  add column if not exists fallback_provider text default 'apifiscal' check (fallback_provider is null or fallback_provider in ('nfewizard','apifiscal')),
  add column if not exists fallback_enabled boolean not null default true,
  add column if not exists certificate_storage_path text,
  add column if not exists certificate_password_encrypted text,
  add column if not exists certificate_expires_at timestamptz,
  add column if not exists apifiscal_certificate_configured boolean not null default false,
  add column if not exists apifiscal_certificate_last_error text,
  add column if not exists apifiscal_certificate_updated_at timestamptz;

update apfiscal.empresa_integracoes_fiscais
set apifiscal_certificate_configured = true
where api_key_encrypted is not null;

create table if not exists apfiscal.fiscal_distribution_state (
  company_id uuid primary key references apfiscal.companies(id) on delete cascade,
  cnpj text not null,
  last_nsu bigint not null default 0 check (last_nsu >= 0),
  last_sync_at timestamptz,
  next_allowed_sync_at timestamptz,
  last_cstat text,
  last_error text,
  locked_at timestamptz,
  locked_by uuid,
  lock_token uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists fiscal_distribution_state_cnpj_uidx on apfiscal.fiscal_distribution_state(cnpj);

insert into apfiscal.fiscal_distribution_state (company_id, cnpj, last_nsu)
select company.id, regexp_replace(company.cnpj, '\D', '', 'g'), coalesce(integration.ultimo_nsu, 0)
from apfiscal.companies company
left join apfiscal.empresa_integracoes_fiscais integration on integration.company_id = company.id
on conflict (company_id) do update set
  cnpj = excluded.cnpj,
  last_nsu = greatest(apfiscal.fiscal_distribution_state.last_nsu, excluded.last_nsu);

alter table apfiscal.fiscal_documents
  add column if not exists source_provider text check (source_provider is null or source_provider in ('nfewizard','apifiscal','manual'));
create unique index if not exists fiscal_documents_company_chave_uidx
  on apfiscal.fiscal_documents(company_id, chave_acesso)
  where chave_acesso is not null and length(chave_acesso) > 0;

alter table apfiscal.manifestations
  add column if not exists provider text check (provider is null or provider in ('nfewizard','apifiscal')),
  add column if not exists sequence integer not null default 1,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists response_cstat text,
  add column if not exists response_xmotivo text;
create unique index if not exists manifestations_idempotency_uidx
  on apfiscal.manifestations(fiscal_document_id, tipo, sequence);

alter table apfiscal.audit_logs
  add column if not exists details jsonb not null default '{}'::jsonb;

-- Bucket privado: XML nunca é público e o browser não recebe acesso direto.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiscal-xml',
  'fiscal-xml',
  false,
  10485760,
  array['application/xml','text/xml','application/zip','application/x-pkcs12','application/pkcs12','application/octet-stream']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function apfiscal.sync_auth_user()
returns trigger language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'apfiscal'
     and not exists (select 1 from apfiscal.users app_user where app_user.id = new.id) then
    return new;
  end if;
  insert into apfiscal.users (id, email, full_name, active)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), true)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end $$;
revoke all on function apfiscal.sync_auth_user() from public, anon, authenticated;

drop trigger if exists apfiscal_sync_auth_user on auth.users;
create trigger apfiscal_sync_auth_user after insert or update of email on auth.users
for each row execute function apfiscal.sync_auth_user();

create or replace function apfiscal.ensure_admin_profile()
returns trigger language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
declare profile_id uuid;
begin
  insert into apfiscal.access_profiles (organization_id, name, description, is_system)
  values (new.id, 'Administrador', 'Acesso completo à organização.', true)
  on conflict (organization_id, (lower(name))) do update set active = true
  returning id into profile_id;
  insert into apfiscal.profile_permissions (profile_id, permission_key)
  select profile_id, key from apfiscal.permissions on conflict do nothing;
  return new;
end $$;
revoke all on function apfiscal.ensure_admin_profile() from public, anon, authenticated;

drop trigger if exists apfiscal_ensure_admin_profile on apfiscal.organizations;
create trigger apfiscal_ensure_admin_profile after insert on apfiscal.organizations
for each row execute function apfiscal.ensure_admin_profile();

create or replace function apfiscal.assign_admin_profile_to_creator()
returns trigger language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
begin
  insert into apfiscal.users (id, email)
  select auth_user.id, coalesce(auth_user.email, '') from auth.users auth_user where auth_user.id = new.user_id
  on conflict (id) do nothing;
  if new.role = 'admin' and new.profile_id is null then
    select id into new.profile_id from apfiscal.access_profiles
    where organization_id = new.organization_id and name = 'Administrador';
  end if;
  return new;
end $$;
revoke all on function apfiscal.assign_admin_profile_to_creator() from public, anon, authenticated;

drop trigger if exists apfiscal_assign_admin_profile on apfiscal.organization_members;
create trigger apfiscal_assign_admin_profile before insert or update of role on apfiscal.organization_members
for each row execute function apfiscal.assign_admin_profile_to_creator();

create or replace function apfiscal.user_has_permission(_user_id uuid, _permission text)
returns boolean language sql stable security definer
set search_path = apfiscal, pg_temp
as $$
  select exists (
    select 1 from apfiscal.organization_members member
    join apfiscal.access_profiles profile on profile.id = member.profile_id and profile.active
    join apfiscal.profile_permissions profile_permission on profile_permission.profile_id = profile.id
    where member.user_id = _user_id and member.active and profile_permission.permission_key = _permission
  )
$$;
revoke all on function apfiscal.user_has_permission(uuid,text) from public, anon, authenticated;
grant execute on function apfiscal.user_has_permission(uuid,text) to service_role;

create or replace function apfiscal.list_user_permissions(_user_id uuid)
returns table(permission_key text) language sql stable security definer
set search_path = apfiscal, pg_temp
as $$
  select distinct pp.permission_key
  from apfiscal.organization_members member
  join apfiscal.access_profiles profile on profile.id = member.profile_id and profile.active
  join apfiscal.profile_permissions pp on pp.profile_id = profile.id
  where member.user_id = _user_id and member.active
$$;
revoke all on function apfiscal.list_user_permissions(uuid) from public, anon, authenticated;
grant execute on function apfiscal.list_user_permissions(uuid) to service_role;

create or replace function apfiscal.user_can_access_company(_user_id uuid, _company_id uuid)
returns boolean language sql stable security definer
set search_path = apfiscal, pg_temp
as $$
  select exists (
    select 1 from apfiscal.companies company
    join apfiscal.organization_members member on member.organization_id = company.organization_id
    where company.id = _company_id and member.user_id = _user_id and member.active
      and (
        not exists (select 1 from apfiscal.company_access access where access.user_id = _user_id)
        or exists (select 1 from apfiscal.company_access access where access.user_id = _user_id and access.company_id = _company_id)
      )
  )
$$;
revoke all on function apfiscal.user_can_access_company(uuid,uuid) from public, anon, authenticated;
grant execute on function apfiscal.user_can_access_company(uuid,uuid) to service_role;

create or replace function apfiscal.try_acquire_fiscal_sync_lock(_company_id uuid, _worker_id uuid, _ttl interval default interval '15 minutes')
returns uuid language plpgsql security definer
set search_path = apfiscal, pg_temp
as $$
declare token uuid := gen_random_uuid();
begin
  update apfiscal.fiscal_distribution_state
  set locked_at = now(), locked_by = _worker_id, lock_token = token, updated_at = now()
  where company_id = _company_id
    and (locked_at is null or locked_at < now() - _ttl);
  if not found then return null; end if;
  return token;
end $$;
revoke all on function apfiscal.try_acquire_fiscal_sync_lock(uuid,uuid,interval) from public, anon, authenticated;
grant execute on function apfiscal.try_acquire_fiscal_sync_lock(uuid,uuid,interval) to service_role;

create or replace function apfiscal.release_fiscal_sync_lock(_company_id uuid, _lock_token uuid)
returns void language sql security definer
set search_path = apfiscal, pg_temp
as $$
  update apfiscal.fiscal_distribution_state set locked_at = null, locked_by = null, lock_token = null, updated_at = now()
  where company_id = _company_id and lock_token = _lock_token
$$;
revoke all on function apfiscal.release_fiscal_sync_lock(uuid,uuid) from public, anon, authenticated;
grant execute on function apfiscal.release_fiscal_sync_lock(uuid,uuid) to service_role;

alter table apfiscal.users enable row level security;
alter table apfiscal.access_profiles enable row level security;
alter table apfiscal.permissions enable row level security;
alter table apfiscal.profile_permissions enable row level security;
alter table apfiscal.fiscal_distribution_state enable row level security;

drop policy if exists users_select_same_org on apfiscal.users;
create policy users_select_same_org on apfiscal.users for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from apfiscal.organization_members mine
    join apfiscal.organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = users.id and mine.active
  )
);
drop policy if exists permissions_read_authenticated on apfiscal.permissions;
create policy permissions_read_authenticated on apfiscal.permissions for select to authenticated using (true);
drop policy if exists profiles_read_org on apfiscal.access_profiles;
create policy profiles_read_org on apfiscal.access_profiles for select to authenticated using (
  exists (select 1 from apfiscal.organization_members member where member.organization_id = access_profiles.organization_id and member.user_id = (select auth.uid()) and member.active)
);
drop policy if exists profile_permissions_read_org on apfiscal.profile_permissions;
create policy profile_permissions_read_org on apfiscal.profile_permissions for select to authenticated using (
  exists (select 1 from apfiscal.access_profiles profile join apfiscal.organization_members member on member.organization_id = profile.organization_id where profile.id = profile_permissions.profile_id and member.user_id = (select auth.uid()) and member.active)
);
drop policy if exists distribution_state_read_org on apfiscal.fiscal_distribution_state;
create policy distribution_state_read_org on apfiscal.fiscal_distribution_state for select to authenticated using (
  exists (select 1 from apfiscal.companies company join apfiscal.organization_members member on member.organization_id = company.organization_id where company.id = fiscal_distribution_state.company_id and member.user_id = (select auth.uid()) and member.active)
);

grant usage on schema apfiscal to authenticated, service_role;
grant select, insert, update, delete on all tables in schema apfiscal to authenticated;
grant all on all tables in schema apfiscal to service_role;
grant usage, select on all sequences in schema apfiscal to authenticated, service_role;
alter default privileges in schema apfiscal grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema apfiscal grant all on tables to service_role;

-- Adiciona o schema sem remover outros schemas já expostos na instância.
do $$
declare configured text := coalesce(current_setting('pgrst.db_schemas', true), 'public,storage,graphql_public');
begin
  if configured !~ '(^|,)\s*apfiscal\s*(,|$)' then
    execute format('alter role authenticator set pgrst.db_schemas = %L', configured || ',apfiscal');
  end if;
exception when insufficient_privilege then
  raise notice 'Configure apfiscal nos schemas expostos do Data API';
end $$;
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

commit;

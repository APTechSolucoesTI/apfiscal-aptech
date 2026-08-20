
CREATE TABLE public.centros_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT centros_custo_codigo_formato CHECK (codigo ~ '^[0-9]{2}\.[0-9]{4}$'),
  CONSTRAINT centros_custo_codigo_empresa_unico UNIQUE (company_id, codigo)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.centros_custo TO authenticated;
GRANT ALL ON public.centros_custo TO service_role;
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "centros_custo_org_members_all" ON public.centros_custo
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE TRIGGER trg_centros_custo_updated_at
  BEFORE UPDATE ON public.centros_custo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_centros_custo_company ON public.centros_custo(company_id);

CREATE TABLE public.plano_contas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conta_pai_id UUID REFERENCES public.plano_contas(id) ON DELETE RESTRICT,
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plano_contas TO authenticated;
GRANT ALL ON public.plano_contas TO service_role;
ALTER TABLE public.plano_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plano_contas_org_members_all" ON public.plano_contas
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE TRIGGER trg_plano_contas_updated_at
  BEFORE UPDATE ON public.plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_plano_contas_company ON public.plano_contas(company_id);
CREATE INDEX idx_plano_contas_pai ON public.plano_contas(conta_pai_id);

CREATE OR REPLACE FUNCTION public.plano_contas_sync_permite_lanc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.conta_pai_id IS NOT NULL THEN
    UPDATE public.plano_contas
      SET permite_lancamentos = false
      WHERE id = NEW.conta_pai_id AND permite_lancamentos = true;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_plano_contas_sync_pai
  AFTER INSERT OR UPDATE OF conta_pai_id ON public.plano_contas
  FOR EACH ROW EXECUTE FUNCTION public.plano_contas_sync_permite_lanc();

ALTER TABLE public.fiscal_documents
  ADD COLUMN IF NOT EXISTS plano_contas_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_plano_contas ON public.fiscal_documents(plano_contas_id);

ALTER TABLE public.fiscal_document_items
  ADD COLUMN IF NOT EXISTS plano_contas_id UUID REFERENCES public.plano_contas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plano_contas_alterado_manualmente BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_fiscal_document_items_plano_contas ON public.fiscal_document_items(plano_contas_id);

CREATE TABLE public.nfe_centro_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  centro_custo_id UUID NOT NULL REFERENCES public.centros_custo(id) ON DELETE RESTRICT,
  valor NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nfe_centro_custo_doc_cc_unico UNIQUE (document_id, centro_custo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_centro_custo TO authenticated;
GRANT ALL ON public.nfe_centro_custo TO service_role;
ALTER TABLE public.nfe_centro_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfe_cc_org_members_all" ON public.nfe_centro_custo
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents d
    JOIN public.companies c ON c.id = d.company_id
    WHERE d.id = document_id AND public.is_org_member(c.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fiscal_documents d
    JOIN public.companies c ON c.id = d.company_id
    WHERE d.id = document_id AND public.is_org_member(c.organization_id)
  ));
CREATE TRIGGER trg_nfe_cc_updated_at
  BEFORE UPDATE ON public.nfe_centro_custo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_nfe_cc_document ON public.nfe_centro_custo(document_id);

CREATE TABLE public.nfe_item_centro_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_item_id UUID NOT NULL REFERENCES public.fiscal_document_items(id) ON DELETE CASCADE,
  centro_custo_id UUID NOT NULL REFERENCES public.centros_custo(id) ON DELETE RESTRICT,
  valor NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nfe_item_cc_item_cc_unico UNIQUE (document_item_id, centro_custo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfe_item_centro_custo TO authenticated;
GRANT ALL ON public.nfe_item_centro_custo TO service_role;
ALTER TABLE public.nfe_item_centro_custo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nfe_item_cc_org_members_all" ON public.nfe_item_centro_custo
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_document_items i
    JOIN public.fiscal_documents d ON d.id = i.document_id
    JOIN public.companies c ON c.id = d.company_id
    WHERE i.id = document_item_id AND public.is_org_member(c.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fiscal_document_items i
    JOIN public.fiscal_documents d ON d.id = i.document_id
    JOIN public.companies c ON c.id = d.company_id
    WHERE i.id = document_item_id AND public.is_org_member(c.organization_id)
  ));
CREATE TRIGGER trg_nfe_item_cc_updated_at
  BEFORE UPDATE ON public.nfe_item_centro_custo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_nfe_item_cc_item ON public.nfe_item_centro_custo(document_item_id);

CREATE OR REPLACE FUNCTION public.check_item_cc_soma()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total_item NUMERIC(15,2);
  v_soma NUMERIC(15,2);
  v_item UUID;
BEGIN
  v_item := COALESCE(NEW.document_item_id, OLD.document_item_id);
  SELECT COALESCE(valor_bruto, 0) INTO v_total_item
    FROM public.fiscal_document_items WHERE id = v_item;
  SELECT COALESCE(SUM(valor), 0) INTO v_soma
    FROM public.nfe_item_centro_custo WHERE document_item_id = v_item;
  IF v_soma > v_total_item + 0.005 THEN
    RAISE EXCEPTION 'Soma dos centros de custo (R$ %) excede o valor do item (R$ %)', v_soma, v_total_item;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_check_item_cc_soma
  AFTER INSERT OR UPDATE OF valor ON public.nfe_item_centro_custo
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_item_cc_soma();

CREATE OR REPLACE FUNCTION public.check_doc_cc_soma()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total NUMERIC(15,2);
  v_soma NUMERIC(15,2);
  v_doc UUID;
BEGIN
  v_doc := COALESCE(NEW.document_id, OLD.document_id);
  SELECT COALESCE(valor_total, 0) INTO v_total
    FROM public.fiscal_documents WHERE id = v_doc;
  SELECT COALESCE(SUM(valor), 0) INTO v_soma
    FROM public.nfe_centro_custo WHERE document_id = v_doc;
  IF v_soma > v_total + 0.005 THEN
    RAISE EXCEPTION 'Soma dos centros de custo (R$ %) excede o valor total da NF-e (R$ %)', v_soma, v_total;
  END IF;
  RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER trg_check_doc_cc_soma
  AFTER INSERT OR UPDATE OF valor ON public.nfe_centro_custo
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_doc_cc_soma();

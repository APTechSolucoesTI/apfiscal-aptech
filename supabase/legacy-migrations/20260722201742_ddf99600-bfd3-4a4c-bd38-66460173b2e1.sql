
-- Expand fiscal_documents to hold complete NF-e payload
ALTER TABLE public.fiscal_documents
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
CREATE TABLE IF NOT EXISTS public.fiscal_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS fiscal_document_items_document_id_idx ON public.fiscal_document_items(document_id);
CREATE INDEX IF NOT EXISTS fiscal_document_items_product_id_idx ON public.fiscal_document_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_document_items TO authenticated;
GRANT ALL ON public.fiscal_document_items TO service_role;

ALTER TABLE public.fiscal_document_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view items of their org documents"
  ON public.fiscal_document_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND public.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can insert items on their org documents"
  ON public.fiscal_document_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND public.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can update items on their org documents"
  ON public.fiscal_document_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND public.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can delete items on their org documents"
  ON public.fiscal_document_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_items.document_id
      AND public.is_org_member(c.organization_id)
  ));

-- Events table (protocolos, cancelamentos, cartas de correção, manifestações)
CREATE TABLE IF NOT EXISTS public.fiscal_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  tipo_evento text NOT NULL,
  codigo_evento text,
  descricao text,
  protocolo text,
  data_evento timestamptz,
  sequencia integer,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fiscal_document_events_document_id_idx ON public.fiscal_document_events(document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_document_events TO authenticated;
GRANT ALL ON public.fiscal_document_events TO service_role;

ALTER TABLE public.fiscal_document_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view events of their org documents"
  ON public.fiscal_document_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND public.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can insert events on their org documents"
  ON public.fiscal_document_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND public.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can update events on their org documents"
  ON public.fiscal_document_events FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND public.is_org_member(c.organization_id)
  ));

CREATE POLICY "Members can delete events on their org documents"
  ON public.fiscal_document_events FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents fd
    JOIN public.companies c ON c.id = fd.company_id
    WHERE fd.id = fiscal_document_events.document_id
      AND public.is_org_member(c.organization_id)
  ));

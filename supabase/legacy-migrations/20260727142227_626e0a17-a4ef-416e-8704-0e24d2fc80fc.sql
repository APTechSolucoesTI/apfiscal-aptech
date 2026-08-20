CREATE TYPE public.doc_integracao_status AS ENUM ('resumida','manifestacao_pendente','aguardando_xml_completo','completa','erro');

CREATE TABLE public.empresa_integracoes_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  api_key_encrypted text,
  api_key_last4 text,
  ativo boolean NOT NULL DEFAULT true,
  ultimo_nsu bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.empresa_integracoes_fiscais TO service_role;
ALTER TABLE public.empresa_integracoes_fiscais ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.documentos_fiscais_integracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nsu bigint NOT NULL,
  chave text NOT NULL,
  tipo_documento text,
  emitente_cnpj text,
  emitente_nome text,
  emitente_ie text,
  data_emissao timestamptz,
  valor_nota numeric(15,2),
  protocolo text,
  status public.doc_integracao_status NOT NULL DEFAULT 'resumida',
  xml_resumido_path text,
  xml_completo_path text,
  tentativas_xml_completo integer NOT NULL DEFAULT 0,
  mensagem_sefaz text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, chave)
);
CREATE INDEX idx_dfi_company_nsu ON public.documentos_fiscais_integracao (company_id, nsu);
CREATE INDEX idx_dfi_status ON public.documentos_fiscais_integracao (status);
GRANT SELECT ON public.documentos_fiscais_integracao TO authenticated;
GRANT ALL ON public.documentos_fiscais_integracao TO service_role;
ALTER TABLE public.documentos_fiscais_integracao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view integration documents"
  ON public.documentos_fiscais_integracao FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE TABLE public.historico_integracao_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.documentos_fiscais_integracao(id) ON DELETE SET NULL,
  acao text NOT NULL,
  status_http integer,
  sucesso boolean NOT NULL DEFAULT true,
  mensagem text,
  payload_bruto jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hif_company_created ON public.historico_integracao_fiscal (company_id, created_at DESC);
GRANT SELECT ON public.historico_integracao_fiscal TO authenticated;
GRANT ALL ON public.historico_integracao_fiscal TO service_role;
ALTER TABLE public.historico_integracao_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view integration history"
  ON public.historico_integracao_fiscal FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

CREATE TRIGGER trg_efi_updated BEFORE UPDATE ON public.empresa_integracoes_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_dfi_updated BEFORE UPDATE ON public.documentos_fiscais_integracao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
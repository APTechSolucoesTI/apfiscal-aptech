CREATE TABLE public.locais_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  tipo text NOT NULL DEFAULT 'sintetico',
  codigo_pai_id uuid REFERENCES public.locais_estoque(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locais_estoque_codigo_formato CHECK (codigo ~ '^\d{2}$' OR codigo ~ '^\d{2}\.\d{3}$'),
  CONSTRAINT locais_estoque_tipo_chk CHECK (tipo IN ('sintetico','analitico'))
);

CREATE UNIQUE INDEX locais_estoque_codigo_company_uidx
  ON public.locais_estoque (organization_id, company_id, codigo)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX locais_estoque_codigo_global_uidx
  ON public.locais_estoque (organization_id, codigo)
  WHERE company_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locais_estoque TO authenticated;
GRANT ALL ON public.locais_estoque TO service_role;

ALTER TABLE public.locais_estoque ENABLE ROW LEVEL SECURITY;

CREATE POLICY locais_estoque_org_members_all ON public.locais_estoque
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER update_locais_estoque_updated_at
  BEFORE UPDATE ON public.locais_estoque
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TYPE public.nfe_status AS ENUM ('pendente_confirmacao','aprovada','pronta_para_integracao','integrado_totvs');

ALTER TABLE public.fiscal_documents
  ADD COLUMN status public.nfe_status NOT NULL DEFAULT 'pendente_confirmacao',
  ADD COLUMN status_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN status_updated_by uuid,
  ADD COLUMN status_observacao text;

COMMENT ON COLUMN public.fiscal_documents.status_manifestacao IS 'DEPRECATED: substituido por public.fiscal_documents.status (enum nfe_status)';

CREATE TABLE public.nfe_status_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nfe_id uuid NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status_anterior public.nfe_status,
  status_novo public.nfe_status NOT NULL,
  alterado_por uuid,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  observacao text
);

GRANT SELECT ON public.nfe_status_historico TO authenticated;
GRANT ALL ON public.nfe_status_historico TO service_role;

ALTER TABLE public.nfe_status_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros veem historico de status"
  ON public.nfe_status_historico FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = nfe_status_historico.company_id AND public.is_org_member(c.organization_id)));

CREATE POLICY "Historico somente via trigger"
  ON public.nfe_status_historico FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE INDEX idx_nfe_status_historico_nfe ON public.nfe_status_historico(nfe_id, alterado_em DESC);

CREATE OR REPLACE FUNCTION public.fn_log_nfe_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_updated_at := now();
    INSERT INTO public.nfe_status_historico (nfe_id, company_id, status_anterior, status_novo, alterado_por, observacao)
    VALUES (NEW.id, NEW.company_id, OLD.status, NEW.status, COALESCE(NEW.status_updated_by, auth.uid()), NEW.status_observacao);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_nfe_status_change
  BEFORE UPDATE ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_nfe_status_change();

CREATE OR REPLACE FUNCTION public.fn_log_nfe_status_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.nfe_status_historico (nfe_id, company_id, status_anterior, status_novo, alterado_por, observacao)
  VALUES (NEW.id, NEW.company_id, NULL, NEW.status, COALESCE(NEW.status_updated_by, auth.uid()), COALESCE(NEW.status_observacao, 'NF-e importada'));
  RETURN NEW;
END $$;

CREATE TRIGGER trg_log_nfe_status_insert
  AFTER INSERT ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_nfe_status_insert();
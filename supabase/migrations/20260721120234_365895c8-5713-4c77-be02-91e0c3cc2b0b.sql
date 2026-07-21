
ALTER TABLE public.companies
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

CREATE UNIQUE INDEX IF NOT EXISTS companies_org_cnpj_unique ON public.companies (organization_id, cnpj);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_companies_updated_at ON public.companies;
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: get or create the current user's organization + admin membership.
CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
    FROM public.organization_members
   WHERE user_id = v_user_id
   LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

  INSERT INTO public.organizations (name) VALUES ('Minha Organização')
    RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'admin');

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated;

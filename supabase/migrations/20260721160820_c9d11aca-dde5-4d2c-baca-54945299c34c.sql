
-- Security definer helpers to avoid recursive RLS on organization_members
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org_id AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _roles app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _org_id AND user_id = auth.uid() AND role = ANY(_roles));
$$;

-- Drop recursive policies
DROP POLICY IF EXISTS "Admins podem gerenciar membros" ON public.organization_members;
DROP POLICY IF EXISTS "Membros da organização podem ver a si mesmos" ON public.organization_members;
DROP POLICY IF EXISTS "Membros da organização podem ver a organização" ON public.organizations;
DROP POLICY IF EXISTS "Membros da organização podem ver empresas" ON public.companies;
DROP POLICY IF EXISTS "Admins e Financeiros podem gerenciar empresas" ON public.companies;

-- organization_members: non-recursive policies
CREATE POLICY "Ver próprios vínculos" ON public.organization_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Ver membros da mesma organização" ON public.organization_members
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Admins gerenciam membros" ON public.organization_members
  FOR ALL USING (public.has_org_role(organization_id, ARRAY['admin']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['admin']::app_role[]));

-- Permitir que um usuário se auto-insira quando ainda não é membro (ensure_user_organization já usa SECURITY DEFINER, mas mantemos consistência)
CREATE POLICY "Auto-inserção inicial de membro" ON public.organization_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- organizations
CREATE POLICY "Membros veem sua organização" ON public.organizations
  FOR SELECT USING (public.is_org_member(id));

-- companies
CREATE POLICY "Membros veem empresas da organização" ON public.companies
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "Admins e Financeiros gerenciam empresas" ON public.companies
  FOR ALL USING (public.has_org_role(organization_id, ARRAY['admin','financeiro']::app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['admin','financeiro']::app_role[]));

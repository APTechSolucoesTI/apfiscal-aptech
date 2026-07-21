
-- Restrict SECURITY DEFINER functions to appropriate callers
REVOKE EXECUTE ON FUNCTION public.upsert_supplier_from_nfe(uuid, uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_product_from_nfe(uuid, uuid, text, text, text, text, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_supplier_from_nfe(uuid, uuid, text, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_product_from_nfe(uuid, uuid, text, text, text, text, text, text, numeric, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_user_organization() FROM PUBLIC, anon;

-- Tighten notification_settings RLS to validate organization membership
DROP POLICY IF EXISTS "Usuários podem gerenciar suas configurações de notificação" ON public.notification_settings;

CREATE POLICY "Users manage their own notification settings"
  ON public.notification_settings
  FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND (organization_id IS NULL OR public.is_org_member(organization_id))
  )
  WITH CHECK (
    user_id = auth.uid()
    AND (organization_id IS NULL OR public.is_org_member(organization_id))
  );

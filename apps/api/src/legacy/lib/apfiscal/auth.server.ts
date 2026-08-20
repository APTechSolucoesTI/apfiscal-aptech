// Autorização por empresa para a integração fiscal. Server-only.
import type { AppSupabaseClient } from "@/integrations/supabase/client.server";

export async function assertCompanyAccess(
  supabase: AppSupabaseClient,
  companyId: string,
): Promise<{ companyId: string; organizationId: string }> {
  const { data, error } = await supabase
    .from("companies")
    .select("id, organization_id")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Empresa não encontrada ou acesso negado.");
  return { companyId: data.id, organizationId: data.organization_id };
}

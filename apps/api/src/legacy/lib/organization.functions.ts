import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CatalogScope = "global" | "per_company";

async function getOrgId(supabase: any): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_user_organization");
  if (error) throw new Error(error.message);
  return data as string;
}

export const getOrgSettings = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context.supabase);
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id, name, plan, catalog_scope")
      .eq("id", orgId)
      .single();
    if (error) throw new Error(error.message);
    return data as { id: string; name: string; plan: string; catalog_scope: CatalogScope };
  });

export const updateCatalogScope = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { scope: CatalogScope }) => data)
  .handler(async ({ data, context }) => {
    if (data.scope !== "global" && data.scope !== "per_company") {
      throw new Error("Escopo inválido");
    }
    const orgId = await getOrgId(context.supabase);
    const { error } = await context.supabase
      .from("organizations")
      .update({ catalog_scope: data.scope })
      .eq("id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

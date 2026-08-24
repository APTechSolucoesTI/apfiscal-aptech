import { Controller, Get, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

@Controller("auth")
export class MeController {
  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    const { data: memberships, error } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role, profile_id, organizations(name)")
      .eq("user_id", request.user.id);
    if (error) throw error;
    const { data: permissions } = await supabaseAdmin.rpc("list_user_permissions", {
      _user_id: request.user.id,
    } as never);
    const account = await supabaseAdmin.from("users").select("is_superadmin, plan_key, max_companies, max_totvs_connections").eq("id", request.user.id).single();
    if (account.error) throw account.error;
    return {
      user: { id: request.user.id, email: request.user.email, fullName: request.user.fullName ?? null },
      memberships: memberships ?? [],
      permissions: permissions ?? [],
      setupRequired: (memberships?.length ?? 0) === 0,
      isSuperadmin: account.data.is_superadmin,
      plan: { key: account.data.plan_key, maxCompanies: account.data.max_companies, maxTotvsConnections: account.data.max_totvs_connections },
    };
  }
}

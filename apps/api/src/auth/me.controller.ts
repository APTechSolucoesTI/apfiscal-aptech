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
    return {
      user: { id: request.user.id, email: request.user.email, fullName: request.user.fullName ?? null },
      memberships: memberships ?? [],
      permissions: permissions ?? [],
      setupRequired: (memberships?.length ?? 0) === 0,
    };
  }
}

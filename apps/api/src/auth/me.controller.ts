import { Controller, Get, Req } from "@nestjs/common";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PlanLimitsService } from "@/plans/plan-limits.service";

@Controller("auth")
export class MeController {
  constructor(private readonly plans: PlanLimitsService) {}

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
    const account = await supabaseAdmin
      .from("users")
      .select("is_superadmin")
      .eq("id", request.user.id)
      .single();
    if (account.error) throw account.error;
    const organizationId = memberships?.[0]?.organization_id;
    const accountPlan = organizationId ? await this.plans.account(organizationId) : null;
    return {
      user: {
        id: request.user.id,
        email: request.user.email,
        fullName: request.user.fullName ?? null,
      },
      memberships: memberships ?? [],
      permissions: permissions ?? [],
      setupRequired: (memberships?.length ?? 0) === 0,
      isSuperadmin: account.data.is_superadmin,
      plan: accountPlan
        ? {
            key: accountPlan.plan.key,
            name: accountPlan.plan.name,
            ...accountPlan.limits,
            features: accountPlan.features,
          }
        : {
            key: "platform",
            name: "Plataforma",
            maxUsers: null,
            maxCompanies: null,
            maxMonthlyDocuments: null,
            maxTotvsConnections: null,
            features: {},
          },
    };
  }
}

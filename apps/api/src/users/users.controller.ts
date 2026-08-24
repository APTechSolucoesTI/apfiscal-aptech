import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { RequirePermission } from "@/common/permission.decorator";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AuthService } from "@/auth/auth.service";
import { PlanLimitsService } from "@/plans/plan-limits.service";

const memberSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  profileId: z.string().uuid(),
  companyIds: z.array(z.string().uuid()).default([]),
});

@Controller("users")
export class UsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly plans: PlanLimitsService,
  ) {}
  private async organizationId(request: AuthenticatedRequest, header?: string): Promise<string> {
    if (header) return header;
    const membership = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", request.user.id)
      .eq("active", true)
      .limit(1)
      .single();
    if (membership.error) throw membership.error;
    return membership.data.organization_id;
  }

  @RequirePermission("settings.users.view")
  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Headers("x-organization-id") orgHeader?: string,
  ) {
    const organizationId = await this.organizationId(request, orgHeader);
    const [members, profiles, companies] = await Promise.all([
      supabaseAdmin
        .from("organization_members")
        .select("id, user_id, profile_id, role, active, created_at")
        .eq("organization_id", organizationId),
      supabaseAdmin
        .from("access_profiles")
        .select("id, name, active")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("name"),
      supabaseAdmin
        .from("companies")
        .select("id, razao_social, nome_fantasia")
        .eq("organization_id", organizationId)
        .order("razao_social"),
    ]);
    if (members.error) throw members.error;
    const userIds = (members.data ?? []).map((member) => member.user_id);
    const [users, access] = userIds.length
      ? await Promise.all([
          supabaseAdmin.from("users").select("id, email, full_name, active").in("id", userIds),
          supabaseAdmin.from("company_access").select("user_id, company_id").in("user_id", userIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
        ];
    if (users.error) throw users.error;
    const profileMap = new Map(
      (profiles.data ?? []).map((profile) => [profile.id, profile.name] as const),
    );
    const userMap = new Map((users.data ?? []).map((user) => [user.id, user] as const));
    return {
      users: (members.data ?? []).map((member) => ({
        ...member,
        user: userMap.get(member.user_id) ?? null,
        profile_name: member.profile_id ? (profileMap.get(member.profile_id) ?? null) : null,
        company_ids: (access.data ?? [])
          .filter((item) => item.user_id === member.user_id)
          .map((item) => item.company_id),
      })),
      profiles: profiles.data ?? [],
      companies: companies.data ?? [],
    };
  }

  @RequirePermission("settings.users.manage")
  @Post("invite")
  async invite(
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("x-organization-id") orgHeader?: string,
  ) {
    const input = memberSchema.parse(raw);
    const organizationId = await this.organizationId(request, orgHeader);
    const profile = await supabaseAdmin
      .from("access_profiles")
      .select("id")
      .eq("id", input.profileId)
      .eq("organization_id", organizationId)
      .eq("active", true)
      .single();
    if (profile.error) throw profile.error;
    return this.auth.invite({ ...input, organizationId, profileId: profile.data.id });
  }

  @RequirePermission("settings.users.manage")
  @Patch(":id")
  async update(
    @Param("id") userId: string,
    @Body() raw: unknown,
    @Req() request: AuthenticatedRequest,
    @Headers("x-organization-id") orgHeader?: string,
  ) {
    const input = memberSchema.omit({ email: true }).extend({ active: z.boolean() }).parse(raw);
    const organizationId = await this.organizationId(request, orgHeader);
    const current = await supabaseAdmin
      .from("organization_members")
      .select("active")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .single();
    if (current.error) throw current.error;
    if (input.active && !current.data.active) await this.plans.assertCanAddUser(organizationId);
    const member = await supabaseAdmin
      .from("organization_members")
      .update({ profile_id: input.profileId, active: input.active })
      .eq("organization_id", organizationId)
      .eq("user_id", userId);
    if (member.error) throw member.error;
    const user = await supabaseAdmin
      .from("users")
      .update({ full_name: input.fullName, active: input.active })
      .eq("id", userId);
    if (user.error) throw user.error;
    await supabaseAdmin.from("company_access").delete().eq("user_id", userId);
    if (input.companyIds.length) {
      const access = await supabaseAdmin
        .from("company_access")
        .insert(input.companyIds.map((company_id) => ({ user_id: userId, company_id })));
      if (access.error) throw access.error;
    }
    return { id: userId, active: input.active };
  }
}

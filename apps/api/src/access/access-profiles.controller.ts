import { Body, Controller, Get, Headers, Param, Patch, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { RequirePermission } from "@/common/permission.decorator";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).nullable().optional(),
  permissionKeys: z.array(z.string()).default([]),
});

@Controller("access-profiles")
export class AccessProfilesController {
  private async organizationId(request: AuthenticatedRequest, header?: string): Promise<string> {
    if (header) return header;
    const { data, error } = await supabaseAdmin.from("organization_members").select("organization_id").eq("user_id", request.user.id).eq("active", true).limit(1).single();
    if (error) throw error;
    return data.organization_id;
  }

  @RequirePermission("settings.profiles.view")
  @Get()
  async list(@Req() request: AuthenticatedRequest, @Headers("x-organization-id") orgHeader?: string) {
    const organizationId = await this.organizationId(request, orgHeader);
    const [profiles, permissions] = await Promise.all([
      supabaseAdmin.from("access_profiles").select("*, profile_permissions(permission_key)").eq("organization_id", organizationId).order("name"),
      supabaseAdmin.from("permissions").select("*").order("module").order("key"),
    ]);
    if (profiles.error) throw profiles.error;
    if (permissions.error) throw permissions.error;
    return { profiles: profiles.data ?? [], permissions: permissions.data ?? [] };
  }

  @RequirePermission("settings.profiles.manage")
  @Post()
  async create(@Body() raw: unknown, @Req() request: AuthenticatedRequest, @Headers("x-organization-id") orgHeader?: string) {
    const input = profileSchema.parse(raw);
    const organizationId = await this.organizationId(request, orgHeader);
    const { data: profile, error } = await supabaseAdmin.from("access_profiles").insert({ organization_id: organizationId, name: input.name, description: input.description ?? null }).select("*").single();
    if (error) throw error;
    if (input.permissionKeys.length) {
      const permissionRows = input.permissionKeys.map((permission_key) => ({ profile_id: profile.id, permission_key }));
      const result = await supabaseAdmin.from("profile_permissions").insert(permissionRows);
      if (result.error) { await supabaseAdmin.from("access_profiles").delete().eq("id", profile.id); throw result.error; }
    }
    return profile;
  }

  @RequirePermission("settings.profiles.manage")
  @Patch(":id")
  async update(@Param("id") id: string, @Body() raw: unknown) {
    const input = profileSchema.extend({ active: z.boolean().optional() }).parse(raw);
    const { data: profile, error } = await supabaseAdmin.from("access_profiles").update({ name: input.name, description: input.description ?? null, active: input.active }).eq("id", id).eq("is_system", false).select("*").single();
    if (error) throw error;
    await supabaseAdmin.from("profile_permissions").delete().eq("profile_id", id);
    if (input.permissionKeys.length) {
      const result = await supabaseAdmin.from("profile_permissions").insert(input.permissionKeys.map((permission_key) => ({ profile_id: id, permission_key })));
      if (result.error) throw result.error;
    }
    return profile;
  }

  @RequirePermission("settings.profiles.manage")
  @Post(":id/duplicate")
  async duplicate(@Param("id") id: string) {
    const source = await supabaseAdmin.from("access_profiles").select("organization_id, name, description, profile_permissions(permission_key)").eq("id", id).single();
    if (source.error) throw source.error;
    const name = `${source.data.name} (cópia)`;
    return this.create({ name, description: source.data.description, permissionKeys: (source.data.profile_permissions ?? []).map((item) => item.permission_key) }, { user: { id: "" } } as AuthenticatedRequest, source.data.organization_id);
  }
}

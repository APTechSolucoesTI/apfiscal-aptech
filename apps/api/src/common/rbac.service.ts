import { ForbiddenException, Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

@Injectable()
export class RbacService {
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc("user_has_permission", {
      _user_id: userId,
      _permission: permission,
    } as never);
    if (!error) return data === true;

    // Compatibilidade durante a aplicação da migration: somente admin legado recebe acesso amplo.
    const legacy = await supabaseAdmin
      .schema("public")
      .from("organization_members")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .limit(1);
    return !legacy.error && (legacy.data?.length ?? 0) > 0;
  }

  async assertPermission(userId: string, permission: string): Promise<void> {
    if (!(await this.hasPermission(userId, permission))) {
      throw new ForbiddenException("Você não possui permissão para esta ação.");
    }
  }

  async assertCompanyAccess(userId: string, companyId: string): Promise<void> {
    const { data, error } = await supabaseAdmin.rpc("user_can_access_company", {
      _user_id: userId,
      _company_id: companyId,
    } as never);
    if (error || data !== true) throw new ForbiddenException("Empresa fora do seu escopo de acesso.");
  }
}

import { Body, Controller, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthenticatedRequest } from "@/common/request-user";
import { RbacService } from "@/common/rbac.service";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { actionRegistry, permissionForAction } from "./action-registry";

@Controller("actions")
export class ActionsController {
  constructor(private readonly rbac: RbacService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(":name")
  async execute(
    @Param("name") name: string,
    @Body() body: { data?: unknown },
    @Req() request: AuthenticatedRequest,
  ) {
    const action = actionRegistry[name];
    if (!action) throw new NotFoundException("Ação de domínio não encontrada.");
    const permission = permissionForAction(name);
    await this.rbac.assertPermission(request.user.id, permission);
    const started = Date.now();
    try {
      const result = await action.execute(body.data, {
        supabase: request.supabase,
        userId: request.user.id,
        claims: { sub: request.user.id, email: request.user.email },
      });
      await this.audit(request.user.id, name, true, Date.now() - started);
      return { data: result };
    } catch (error) {
      await this.audit(request.user.id, name, false, Date.now() - started);
      throw error;
    }
  }

  private async audit(userId: string, action: string, success: boolean, durationMs: number) {
    const membership = await supabaseAdmin.from("organization_members").select("organization_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!membership.data?.organization_id) return;
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: membership.data.organization_id,
      user_id: userId,
      action: `api.${action}`,
      entity: "domain_action",
      details: { success, duration_ms: durationMs },
    } as never).then(() => undefined, () => undefined);
  }
}

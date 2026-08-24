import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "@/auth/auth.service";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsQueueService } from "@/totvs/totvs-queue.service";
import { TotvsSqlServerService } from "@/totvs/totvs-sql-server.service";

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120), active: z.boolean(), planKey: z.string().trim().min(2).max(40),
  maxCompanies: z.number().int().positive().nullable(), maxTotvsConnections: z.number().int().positive().nullable(),
});
const inviteSchema = z.object({
  fullName: z.string().trim().min(2).max(120), email: z.string().email(), organizationId: z.string().uuid(),
  profileId: z.string().uuid(), companyIds: z.array(z.string().uuid()).default([]),
});
const companyConnectionSchema = z.object({ connectionKey: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/).nullable(), coligadaId: z.number().int().positive().nullable() });
const accessSchema = z.object({ companyIds: z.array(z.string().uuid()) });

@Controller("superadmin")
export class SuperadminController {
  constructor(private readonly auth: AuthService, private readonly sqlServer: TotvsSqlServerService, private readonly queue: TotvsQueueService) {}

  private async assert(userId: string) {
    const user = await supabaseAdmin.from("users").select("is_superadmin").eq("id", userId).single();
    if (user.error || !user.data.is_superadmin) throw new ForbiddenException("Acesso exclusivo do Super Admin.");
  }

  @Get("dashboard")
  async dashboard(@Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    const [users, organizations, companies, memberships, profiles, access, runs, scheduler] = await Promise.all([
      supabaseAdmin.from("users").select("id, email, full_name, active, is_superadmin, plan_key, max_companies, max_totvs_connections, last_login_at, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("organizations").select("id, name, plan, created_at").order("name"),
      supabaseAdmin.from("companies").select("id, organization_id, razao_social, nome_fantasia, cnpj, totvs_connection_key, totvs_coligada_id").order("razao_social"),
      supabaseAdmin.from("organization_members").select("user_id, organization_id, profile_id, active"),
      supabaseAdmin.from("access_profiles").select("id, organization_id, name, active").eq("active", true).order("name"),
      supabaseAdmin.from("company_access").select("user_id, company_id"),
      supabaseAdmin.from("totvs_sync_runs").select("id, organization_id, connection_key, status, trigger, started_at, finished_at, error_message, created_at").order("created_at", { ascending: false }).limit(50),
      this.queue.nfeSchedulerStatus(),
    ]);
    for (const result of [users, organizations, companies, memberships, profiles, access, runs]) if (result.error) throw result.error;
    return { users: users.data ?? [], organizations: organizations.data ?? [], companies: companies.data ?? [], memberships: memberships.data ?? [], profiles: profiles.data ?? [], companyAccess: access.data ?? [], runs: runs.data ?? [], scheduler, connections: this.sqlServer.connections() };
  }

  @Post("users")
  async invite(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    return this.auth.invite(inviteSchema.parse(body));
  }

  @Patch("users/:id")
  async updateUser(@Param("id") id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    const input = updateUserSchema.parse(body);
    const result = await supabaseAdmin.from("users").update({ full_name: input.fullName, active: input.active, plan_key: input.planKey, max_companies: input.maxCompanies, max_totvs_connections: input.maxTotvsConnections }).eq("id", id).eq("is_superadmin", false);
    if (result.error) throw result.error;
    return { ok: true };
  }

  @Patch("users/:id/access")
  async updateUserAccess(@Param("id") id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    const input = accessSchema.parse(body);
    const [target, memberships] = await Promise.all([
      supabaseAdmin.from("users").select("max_companies, max_totvs_connections").eq("id", id).single(),
      supabaseAdmin.from("organization_members").select("organization_id").eq("user_id", id).eq("active", true),
    ]);
    if (target.error) throw target.error;
    if (memberships.error) throw memberships.error;
    if (target.data.max_companies && input.companyIds.length > target.data.max_companies) throw new BadRequestException("O acesso excede o limite de empresas do plano.");
    if (input.companyIds.length) {
      const companies = await supabaseAdmin.from("companies").select("id, organization_id, totvs_connection_key").in("id", input.companyIds);
      if (companies.error) throw companies.error;
      if ((companies.data?.length ?? 0) !== input.companyIds.length) throw new BadRequestException("Uma empresa informada não existe.");
      const organizationIds = new Set((memberships.data ?? []).map((membership) => membership.organization_id));
      if ((companies.data ?? []).some((company) => !organizationIds.has(company.organization_id))) throw new BadRequestException("A empresa não pertence a uma organização ativa do usuário.");
      const connectionCount = new Set((companies.data ?? []).map((company) => company.totvs_connection_key).filter(Boolean)).size;
      if (target.data.max_totvs_connections && connectionCount > target.data.max_totvs_connections) throw new BadRequestException("O acesso excede o limite de conexões TOTVS do plano.");
    }
    const removed = await supabaseAdmin.from("company_access").delete().eq("user_id", id);
    if (removed.error) throw removed.error;
    if (input.companyIds.length) {
      const inserted = await supabaseAdmin.from("company_access").insert(input.companyIds.map((company_id) => ({ user_id: id, company_id })));
      if (inserted.error) throw inserted.error;
    }
    return { ok: true };
  }

  @Patch("companies/:id/connection")
  async updateCompanyConnection(@Param("id") id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    const input = companyConnectionSchema.parse(body);
    if (Boolean(input.connectionKey) !== Boolean(input.coligadaId)) throw new BadRequestException("Informe conexão e coligada juntas, ou remova ambas.");
    if (input.connectionKey) {
      const connection = this.sqlServer.connections().find((item) => item.key === input.connectionKey && item.configured);
      if (!connection) throw new BadRequestException("Conexão não disponível no ambiente.");
      if (!connection.coligadas.includes(input.coligadaId!)) throw new BadRequestException("Coligada não permitida nessa conexão.");
    }
    const result = await supabaseAdmin.from("companies").update({ totvs_connection_key: input.connectionKey, totvs_coligada_id: input.coligadaId }).eq("id", id);
    if (result.error) throw result.error;
    await this.queue.refreshSchedulers();
    return { ok: true };
  }

  @Post("connections/:key/test")
  async testConnection(@Param("key") key: string, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    return this.sqlServer.testConnection(key);
  }

  @Post("organizations/:organizationId/connections/:key/sync")
  async sync(@Param("organizationId") organizationId: string, @Param("key") key: string, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    const connection = this.sqlServer.connections().find((item) => item.key === key && item.configured);
    if (!connection) throw new BadRequestException("Conexão não disponível no ambiente.");
    const linked = await supabaseAdmin.from("companies").select("id").eq("organization_id", organizationId).eq("totvs_connection_key", key).limit(1).maybeSingle();
    if (linked.error) throw linked.error;
    if (!linked.data) throw new BadRequestException("A conexão não está vinculada a nenhuma empresa desta organização.");
    return this.queue.enqueueSync({ organizationId, connectionKey: key, userId: request.user.id, trigger: "manual" });
  }
}

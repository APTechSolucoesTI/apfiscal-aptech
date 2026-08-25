import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { z } from "zod";
import { AuthService } from "@/auth/auth.service";
import type { AuthenticatedRequest } from "@/common/request-user";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PlanLimitsService } from "@/plans/plan-limits.service";
import { TotvsQueueService } from "@/totvs/totvs-queue.service";
import { TotvsSqlServerService } from "@/totvs/totvs-sql-server.service";
import { effectiveTotvsConnectionKey } from "@/totvs/totvs-scope";

const updateUserSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  active: z.boolean(),
});
const inviteSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  organizationId: z.string().uuid(),
  profileId: z.string().uuid(),
  companyIds: z.array(z.string().uuid()).default([]),
});
const companyConnectionSchema = z.object({
  connectionKey: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,63}$/)
    .nullable(),
  coligadaId: z.number().int().positive().nullable(),
  filialId: z.number().int().positive().nullable(),
});
const totvsStructureSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("COLIGADA"), mainColigadaId: z.null() }),
  z.object({ mode: z.literal("FILIAL"), mainColigadaId: z.number().int().positive() }),
]);
const totvsHomologationSchema = z.object({ enabled: z.boolean() });
const accessSchema = z.object({ companyIds: z.array(z.string().uuid()) });
const planSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable(),
  priceLabel: z.string().trim().max(80).nullable(),
  active: z.boolean(),
  highlighted: z.boolean(),
  maxUsers: z.number().int().positive().nullable(),
  maxCompanies: z.number().int().positive().nullable(),
  maxMonthlyDocuments: z.number().int().positive().nullable(),
  maxTotvsConnections: z.number().int().positive().nullable(),
  features: z.record(z.string(), z.boolean()),
  sortOrder: z.number().int().min(0).max(999),
});
const accountPlanSchema = z.object({
  planKey: z.string().regex(/^[a-z][a-z0-9_-]{1,39}$/),
  maxUsersOverride: z.number().int().positive().nullable(),
  maxCompaniesOverride: z.number().int().positive().nullable(),
  maxMonthlyDocumentsOverride: z.number().int().positive().nullable(),
  maxTotvsConnectionsOverride: z.number().int().positive().nullable(),
});

@Controller("superadmin")
export class SuperadminController {
  constructor(
    private readonly auth: AuthService,
    private readonly sqlServer: TotvsSqlServerService,
    private readonly queue: TotvsQueueService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private async assert(userId: string) {
    const user = await supabaseAdmin
      .from("users")
      .select("is_superadmin")
      .eq("id", userId)
      .single();
    if (user.error || !user.data.is_superadmin)
      throw new ForbiddenException("Acesso exclusivo do Super Admin.");
  }

  @Get("dashboard")
  async dashboard(@Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    const [users, organizations, companies, memberships, profiles, access, runs, plans, scheduler] =
      await Promise.all([
        supabaseAdmin
          .from("users")
          .select("id, email, full_name, active, is_superadmin, last_login_at, created_at")
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("organizations")
          .select(
            "id, name, plan_key, max_users_override, max_companies_override, max_monthly_documents_override, max_totvs_connections_override, totvs_structure_mode, totvs_main_coligada_id, totvs_homologation_mode, created_at",
          )
          .order("name"),
        supabaseAdmin
          .from("companies")
          .select(
            "id, organization_id, razao_social, nome_fantasia, cnpj, totvs_connection_key, totvs_coligada_id, totvs_filial_id",
          )
          .order("razao_social"),
        supabaseAdmin
          .from("organization_members")
          .select("user_id, organization_id, profile_id, active"),
        supabaseAdmin
          .from("access_profiles")
          .select("id, organization_id, name, active")
          .eq("active", true)
          .order("name"),
        supabaseAdmin.from("company_access").select("user_id, company_id"),
        supabaseAdmin
          .from("totvs_sync_runs")
          .select(
            "id, organization_id, connection_key, status, trigger, started_at, finished_at, error_message, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin.from("subscription_plans").select("*").order("sort_order"),
        this.queue.nfeSchedulerStatus(),
      ]);
    for (const result of [
      users,
      organizations,
      companies,
      memberships,
      profiles,
      access,
      runs,
      plans,
    ])
      if (result.error) throw result.error;
    return {
      users: users.data ?? [],
      organizations: organizations.data ?? [],
      companies: companies.data ?? [],
      memberships: memberships.data ?? [],
      profiles: profiles.data ?? [],
      companyAccess: access.data ?? [],
      runs: runs.data ?? [],
      plans: plans.data ?? [],
      scheduler,
      connections: this.sqlServer.connections(),
    };
  }

  @Post("plans")
  async createPlan(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    const result = await supabaseAdmin
      .from("subscription_plans")
      .insert(planRow(planSchema.parse(body)));
    if (result.error) throw result.error;
    return { ok: true };
  }

  @Patch("plans/:key")
  async updatePlan(
    @Param("key") key: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    const input = planSchema.parse(body);
    if (input.key !== key)
      throw new BadRequestException("A chave de um plano existente não pode ser alterada.");
    if (!input.active) {
      const accounts = await supabaseAdmin
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("plan_key", key);
      if (accounts.error) throw accounts.error;
      if ((accounts.count ?? 0) > 0)
        throw new BadRequestException(
          `Este plano está em uso por ${accounts.count} conta(s). Troque essas contas de plano antes de desativá-lo.`,
        );
    }
    const result = await supabaseAdmin
      .from("subscription_plans")
      .update(planRow(input))
      .eq("key", key);
    if (result.error) throw result.error;
    return { ok: true };
  }

  @Patch("organizations/:id/plan")
  async updateAccountPlan(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    const input = accountPlanSchema.parse(body);
    const plan = await supabaseAdmin
      .from("subscription_plans")
      .select("key")
      .eq("key", input.planKey)
      .eq("active", true)
      .single();
    if (plan.error) throw new BadRequestException("Plano ativo não encontrado.");
    const result = await supabaseAdmin
      .from("organizations")
      .update({
        plan_key: input.planKey,
        max_users_override: input.maxUsersOverride,
        max_companies_override: input.maxCompaniesOverride,
        max_monthly_documents_override: input.maxMonthlyDocumentsOverride,
        max_totvs_connections_override: input.maxTotvsConnectionsOverride,
      })
      .eq("id", id);
    if (result.error) throw result.error;
    return { ok: true };
  }

  @Post("users")
  async invite(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    return this.auth.invite(inviteSchema.parse(body));
  }

  @Patch("users/:id")
  async updateUser(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    const input = updateUserSchema.parse(body);
    const current = await supabaseAdmin
      .from("users")
      .select("active")
      .eq("id", id)
      .eq("is_superadmin", false)
      .single();
    if (current.error) throw current.error;
    if (input.active && !current.data.active) {
      const memberships = await supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", id)
        .eq("active", true);
      if (memberships.error) throw memberships.error;
      for (const membership of memberships.data ?? [])
        await this.planLimits.assertCanAddUser(membership.organization_id);
    }
    const result = await supabaseAdmin
      .from("users")
      .update({ full_name: input.fullName, active: input.active })
      .eq("id", id)
      .eq("is_superadmin", false);
    if (result.error) throw result.error;
    return { ok: true };
  }

  @Patch("users/:id/access")
  async updateUserAccess(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    const input = accessSchema.parse(body);
    const memberships = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", id)
      .eq("active", true);
    if (memberships.error) throw memberships.error;
    if (input.companyIds.length) {
      const companies = await supabaseAdmin
        .from("companies")
        .select("id, organization_id")
        .in("id", input.companyIds);
      if (companies.error) throw companies.error;
      if ((companies.data?.length ?? 0) !== input.companyIds.length)
        throw new BadRequestException("Uma empresa informada não existe.");
      const organizationIds = new Set(
        (memberships.data ?? []).map((membership) => membership.organization_id),
      );
      if ((companies.data ?? []).some((company) => !organizationIds.has(company.organization_id)))
        throw new BadRequestException("A empresa não pertence a uma organização ativa do usuário.");
    }
    const removed = await supabaseAdmin.from("company_access").delete().eq("user_id", id);
    if (removed.error) throw removed.error;
    if (input.companyIds.length) {
      const inserted = await supabaseAdmin
        .from("company_access")
        .insert(input.companyIds.map((company_id) => ({ user_id: id, company_id })));
      if (inserted.error) throw inserted.error;
    }
    return { ok: true };
  }

  @Patch("companies/:id/connection")
  async updateCompanyConnection(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    const input = companyConnectionSchema.parse(body);
    const company = await supabaseAdmin
      .from("companies")
      .select(
        "organization_id, organizations(totvs_structure_mode, totvs_main_coligada_id, totvs_homologation_mode)",
      )
      .eq("id", id)
      .single();
    if (company.error) throw company.error;
    const organization = company.data.organizations as unknown as {
      totvs_structure_mode: "COLIGADA" | "FILIAL";
      totvs_main_coligada_id: number | null;
      totvs_homologation_mode: boolean;
    };
    const scopeId =
      organization.totvs_structure_mode === "FILIAL" ? input.filialId : input.coligadaId;
    if (Boolean(input.connectionKey) !== Boolean(scopeId))
      throw new BadRequestException(
        organization.totvs_structure_mode === "FILIAL"
          ? "Informe conexão e filial juntas, ou remova ambas."
          : "Informe conexão e coligada juntas, ou remova ambas.",
      );
    if (organization.totvs_structure_mode === "FILIAL" && input.coligadaId !== null)
      throw new BadRequestException("No modo Por Filial, a coligada vem da conta.");
    if (organization.totvs_structure_mode === "COLIGADA" && input.filialId !== null)
      throw new BadRequestException("Filial não pode ser usada no modo Por Coligada.");
    if (input.connectionKey) {
      if (input.connectionKey.endsWith("_HOMOLOG"))
        throw new BadRequestException(
          "Vincule a conexão principal; o modo homologação é aplicado pela conta.",
        );
      const effectiveKey = effectiveTotvsConnectionKey(
        input.connectionKey,
        organization.totvs_homologation_mode,
      );
      const connection = this.sqlServer
        .connections()
        .find((item) => item.key === effectiveKey && item.configured);
      if (!connection)
        throw new BadRequestException(`Conexão ${effectiveKey} não disponível no ambiente.`);
      const coligada =
        organization.totvs_structure_mode === "FILIAL"
          ? organization.totvs_main_coligada_id
          : input.coligadaId;
      if (!coligada || !connection.coligadas.includes(coligada))
        throw new BadRequestException("Coligada não permitida nessa conexão.");
      await this.planLimits.assertCanLinkTotvsConnection(
        company.data.organization_id,
        input.connectionKey,
      );
    }
    const result = await supabaseAdmin
      .from("companies")
      .update({
        totvs_connection_key: input.connectionKey,
        totvs_coligada_id:
          organization.totvs_structure_mode === "COLIGADA" ? input.coligadaId : null,
        totvs_filial_id: organization.totvs_structure_mode === "FILIAL" ? input.filialId : null,
      })
      .eq("id", id);
    if (result.error) throw result.error;
    await this.queue.refreshSchedulers();
    return { ok: true };
  }

  @Patch("organizations/:id/totvs-homologation")
  async updateTotvsHomologation(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    const input = totvsHomologationSchema.parse(body);
    if (input.enabled) {
      const mappings = await supabaseAdmin
        .from("companies")
        .select("totvs_connection_key")
        .eq("organization_id", id)
        .not("totvs_connection_key", "is", null);
      if (mappings.error) throw mappings.error;
      const missing = [...new Set((mappings.data ?? []).map((item) => item.totvs_connection_key))]
        .filter((key): key is string => Boolean(key))
        .map((key) => effectiveTotvsConnectionKey(key, true))
        .filter((key) => !this.sqlServer.configured(key));
      if (missing.length)
        throw new BadRequestException(
          `Configure antes as conexões de homologação: ${missing.join(", ")}.`,
        );
    }
    const result = await supabaseAdmin
      .from("organizations")
      .update({ totvs_homologation_mode: input.enabled })
      .eq("id", id);
    if (result.error) throw result.error;
    await this.queue.refreshSchedulers(id);
    return { ok: true };
  }

  @Patch("organizations/:id/totvs-structure")
  async updateTotvsStructure(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    const input = totvsStructureSchema.parse(body);
    if (
      input.mode === "FILIAL" &&
      !this.sqlServer
        .connections()
        .some((connection) => connection.coligadas.includes(input.mainColigadaId))
    )
      throw new BadRequestException("Coligada principal não disponível no ambiente.");
    const result = await supabaseAdmin.rpc("configure_totvs_structure", {
      _organization_id: id,
      _mode: input.mode,
      _main_coligada_id: input.mainColigadaId,
    });
    if (result.error) throw result.error;
    await this.queue.refreshSchedulers(id);
    return { ok: true };
  }

  @Post("connections/:key/test")
  async testConnection(@Param("key") key: string, @Req() request: AuthenticatedRequest) {
    await this.assert(request.user.id);
    return this.sqlServer.testConnection(key);
  }

  @Post("organizations/:organizationId/connections/:key/sync")
  async sync(
    @Param("organizationId") organizationId: string,
    @Param("key") key: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.assert(request.user.id);
    await this.planLimits.assertFeature(organizationId, "totvs_integration", "Integração TOTVS");
    const organization = await supabaseAdmin
      .from("organizations")
      .select("totvs_homologation_mode")
      .eq("id", organizationId)
      .single();
    if (organization.error) throw organization.error;
    const effectiveKey = effectiveTotvsConnectionKey(
      key,
      Boolean(organization.data.totvs_homologation_mode),
    );
    const connection = this.sqlServer
      .connections()
      .find((item) => item.key === effectiveKey && item.configured);
    if (!connection) throw new BadRequestException("Conexão não disponível no ambiente.");
    const linked = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("totvs_connection_key", key)
      .limit(1)
      .maybeSingle();
    if (linked.error) throw linked.error;
    if (!linked.data)
      throw new BadRequestException(
        "A conexão não está vinculada a nenhuma empresa desta organização.",
      );
    return this.queue.enqueueSync({
      organizationId,
      connectionKey: effectiveKey,
      userId: request.user.id,
      trigger: "manual",
    });
  }
}

function planRow(input: z.infer<typeof planSchema>) {
  return {
    key: input.key,
    name: input.name,
    description: input.description,
    price_label: input.priceLabel,
    active: input.active,
    highlighted: input.highlighted,
    max_users: input.maxUsers,
    max_companies: input.maxCompanies,
    max_monthly_documents: input.maxMonthlyDocuments,
    max_totvs_connections: input.maxTotvsConnections,
    features: input.features,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
}

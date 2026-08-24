import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PlanFeature =
  | "automatic_nfe"
  | "automatic_nfse"
  | "automatic_manifestation"
  | "api_integration"
  | "advanced_dashboards"
  | "totvs_integration";

@Injectable()
export class PlanLimitsService {
  async account(organizationId: string) {
    const organization = await supabaseAdmin
      .from("organizations")
      .select(
        "id, plan_key, max_users_override, max_companies_override, max_monthly_documents_override, max_totvs_connections_override",
      )
      .eq("id", organizationId)
      .single();
    if (organization.error) throw organization.error;
    // An account keeps its contracted rules even if the plan is retired for new sales.
    const plan = await supabaseAdmin
      .from("subscription_plans")
      .select("*")
      .eq("key", organization.data.plan_key)
      .single();
    if (plan.error) throw plan.error;
    return {
      plan: plan.data,
      limits: {
        maxUsers: organization.data.max_users_override ?? plan.data.max_users,
        maxCompanies: organization.data.max_companies_override ?? plan.data.max_companies,
        maxMonthlyDocuments:
          organization.data.max_monthly_documents_override ?? plan.data.max_monthly_documents,
        maxTotvsConnections:
          organization.data.max_totvs_connections_override ?? plan.data.max_totvs_connections,
      },
      features: (plan.data.features ?? {}) as Record<string, boolean>,
    };
  }

  async assertCanAddUser(organizationId: string) {
    const account = await this.account(organizationId);
    if (!account.limits.maxUsers) return;
    const count = await supabaseAdmin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("active", true);
    if (count.error) throw count.error;
    if ((count.count ?? 0) >= account.limits.maxUsers)
      throw new BadRequestException(
        `Limite de usuários atingido: o plano ${account.plan.name} permite ${account.limits.maxUsers}. Ajuste o plano ou o limite da conta no Super Admin.`,
      );
  }

  async assertFeature(organizationId: string, feature: PlanFeature, label: string) {
    const account = await this.account(organizationId);
    if (!account.features[feature])
      throw new ForbiddenException(
        `${label} não está disponível no plano ${account.plan.name}. Altere o plano da conta no Super Admin para habilitar este recurso.`,
      );
  }

  async assertCanLinkTotvsConnection(organizationId: string, connectionKey: string) {
    const account = await this.account(organizationId);
    if (!account.features.totvs_integration)
      throw new ForbiddenException(
        `Integração TOTVS não está disponível no plano ${account.plan.name}.`,
      );
    if (!account.limits.maxTotvsConnections) return;
    const companies = await supabaseAdmin
      .from("companies")
      .select("totvs_connection_key")
      .eq("organization_id", organizationId)
      .not("totvs_connection_key", "is", null);
    if (companies.error) throw companies.error;
    const keys = new Set(
      (companies.data ?? []).map((company) => company.totvs_connection_key).filter(Boolean),
    );
    keys.add(connectionKey);
    if (keys.size > account.limits.maxTotvsConnections)
      throw new BadRequestException(
        `Limite de conexões TOTVS atingido: o plano ${account.plan.name} permite ${account.limits.maxTotvsConnections}.`,
      );
  }
}

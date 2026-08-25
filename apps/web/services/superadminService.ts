"use client";

import { backendFetch } from "@/lib/backend";

export type AdminConnection = {
  key: string;
  description: string;
  database: string | null;
  configured: boolean;
  writesEnabled: boolean;
  coligadas: number[];
};
export type SubscriptionPlan = {
  key: string;
  name: string;
  description: string | null;
  price_label: string | null;
  active: boolean;
  highlighted: boolean;
  max_users: number | null;
  max_companies: number | null;
  max_monthly_documents: number | null;
  max_totvs_connections: number | null;
  features: Record<string, boolean>;
  sort_order: number;
};
export type PlanInput = {
  key: string;
  name: string;
  description: string | null;
  priceLabel: string | null;
  active: boolean;
  highlighted: boolean;
  maxUsers: number | null;
  maxCompanies: number | null;
  maxMonthlyDocuments: number | null;
  maxTotvsConnections: number | null;
  features: Record<string, boolean>;
  sortOrder: number;
};
export type AccountPlanInput = {
  planKey: string;
  maxUsersOverride: number | null;
  maxCompaniesOverride: number | null;
  maxMonthlyDocumentsOverride: number | null;
  maxTotvsConnectionsOverride: number | null;
};
export type SuperadminPayload = {
  users: Array<{
    id: string;
    email: string;
    full_name: string | null;
    active: boolean;
    is_superadmin: boolean;
    last_login_at: string | null;
    created_at: string;
  }>;
  organizations: Array<{
    id: string;
    name: string;
    plan_key: string;
    max_users_override: number | null;
    max_companies_override: number | null;
    max_monthly_documents_override: number | null;
    max_totvs_connections_override: number | null;
    totvs_structure_mode: "COLIGADA" | "FILIAL";
    totvs_main_coligada_id: number | null;
    created_at: string | null;
  }>;
  companies: Array<{
    id: string;
    organization_id: string;
    razao_social: string;
    nome_fantasia: string | null;
    cnpj: string;
    totvs_connection_key: string | null;
    totvs_coligada_id: number | null;
    totvs_filial_id: number | null;
  }>;
  memberships: Array<{
    user_id: string;
    organization_id: string;
    profile_id: string | null;
    active: boolean;
  }>;
  profiles: Array<{ id: string; organization_id: string; name: string; active: boolean }>;
  companyAccess: Array<{ user_id: string; company_id: string }>;
  connections: AdminConnection[];
  plans: SubscriptionPlan[];
  runs: Array<{
    id: string;
    organization_id: string;
    connection_key: string | null;
    status: string;
    trigger: string;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
    created_at: string;
  }>;
  scheduler: {
    configured: boolean;
    workers: number;
    schedulers: Array<{ key: string; next: string | null }>;
  };
};

export const getSuperadminDashboard = () =>
  backendFetch<SuperadminPayload>("/superadmin/dashboard");
export const saveAdminPlan = (input: PlanInput, existing: boolean) =>
  backendFetch<{ ok: true }>(existing ? `/superadmin/plans/${input.key}` : "/superadmin/plans", {
    method: existing ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
export const updateAccountPlan = (id: string, input: AccountPlanInput) =>
  backendFetch<{ ok: true }>(`/superadmin/organizations/${id}/plan`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const updateAdminUser = (id: string, input: { fullName: string; active: boolean }) =>
  backendFetch<{ ok: true }>(`/superadmin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const updateAdminUserAccess = (id: string, companyIds: string[]) =>
  backendFetch<{ ok: true }>(`/superadmin/users/${id}/access`, {
    method: "PATCH",
    body: JSON.stringify({ companyIds }),
  });
export const inviteAdminUser = (input: {
  fullName: string;
  email: string;
  organizationId: string;
  profileId: string;
  companyIds: string[];
}) => backendFetch("/superadmin/users", { method: "POST", body: JSON.stringify(input) });
export const updateAdminCompanyConnection = (
  id: string,
  input: {
    connectionKey: string | null;
    coligadaId: number | null;
    filialId: number | null;
  },
) =>
  backendFetch<{ ok: true }>(`/superadmin/companies/${id}/connection`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const updateAdminTotvsStructure = (
  id: string,
  input:
    | { mode: "COLIGADA"; mainColigadaId: null }
    | { mode: "FILIAL"; mainColigadaId: number },
) =>
  backendFetch<{ ok: true }>(`/superadmin/organizations/${id}/totvs-structure`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
export const testAdminConnection = (key: string) =>
  backendFetch<{ database: string }>(`/superadmin/connections/${key}/test`, { method: "POST" });
export const syncAdminConnection = (organizationId: string, key: string) =>
  backendFetch(`/superadmin/organizations/${organizationId}/connections/${key}/sync`, {
    method: "POST",
  });

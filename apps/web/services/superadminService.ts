"use client";

import { backendFetch } from "@/lib/backend";

export type AdminConnection = { key: string; description: string; database: string | null; configured: boolean; writesEnabled: boolean; coligadas: number[] };
export type SuperadminPayload = {
  users: Array<{ id: string; email: string; full_name: string | null; active: boolean; is_superadmin: boolean; plan_key: string; max_companies: number | null; max_totvs_connections: number | null; last_login_at: string | null; created_at: string }>;
  organizations: Array<{ id: string; name: string; plan: string; created_at: string | null }>;
  companies: Array<{ id: string; organization_id: string; razao_social: string; nome_fantasia: string | null; cnpj: string; totvs_connection_key: string | null; totvs_coligada_id: number | null }>;
  memberships: Array<{ user_id: string; organization_id: string; profile_id: string | null; active: boolean }>;
  profiles: Array<{ id: string; organization_id: string; name: string; active: boolean }>;
  companyAccess: Array<{ user_id: string; company_id: string }>;
  connections: AdminConnection[];
  runs: Array<{ id: string; organization_id: string; connection_key: string | null; status: string; trigger: string; started_at: string | null; finished_at: string | null; error_message: string | null; created_at: string }>;
  scheduler: { configured: boolean; workers: number; schedulers: Array<{ key: string; next: string | null }> };
};

export const getSuperadminDashboard = () => backendFetch<SuperadminPayload>("/superadmin/dashboard");
export const updateAdminUser = (id: string, input: { fullName: string; active: boolean; planKey: string; maxCompanies: number | null; maxTotvsConnections: number | null }) => backendFetch<{ ok: true }>(`/superadmin/users/${id}`, { method: "PATCH", body: JSON.stringify(input) });
export const updateAdminUserAccess = (id: string, companyIds: string[]) => backendFetch<{ ok: true }>(`/superadmin/users/${id}/access`, { method: "PATCH", body: JSON.stringify({ companyIds }) });
export const inviteAdminUser = (input: { fullName: string; email: string; organizationId: string; profileId: string; companyIds: string[] }) => backendFetch("/superadmin/users", { method: "POST", body: JSON.stringify(input) });
export const updateAdminCompanyConnection = (id: string, input: { connectionKey: string | null; coligadaId: number | null }) => backendFetch<{ ok: true }>(`/superadmin/companies/${id}/connection`, { method: "PATCH", body: JSON.stringify(input) });
export const testAdminConnection = (key: string) => backendFetch<{ database: string }>(`/superadmin/connections/${key}/test`, { method: "POST" });
export const syncAdminConnection = (organizationId: string, key: string) => backendFetch(`/superadmin/organizations/${organizationId}/connections/${key}/sync`, { method: "POST" });

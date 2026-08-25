import { Injectable, NotFoundException } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsSqlServerService } from "./totvs-sql-server.service";
import {
  effectiveTotvsConnectionKey,
  resolveTotvsCompanyScopes,
  type TotvsCompanyScope,
  type TotvsStructureMode,
} from "./totvs-scope";

@Injectable()
export class TotvsScopeService {
  constructor(private readonly sqlServer: TotvsSqlServerService) {}

  async resolve(organizationId: string, companyId?: string): Promise<TotvsCompanyScope[]> {
    const [organization, companies] = await Promise.all([
      supabaseAdmin
        .from("organizations")
        .select("totvs_structure_mode, totvs_main_coligada_id, totvs_homologation_mode")
        .eq("id", organizationId)
        .single(),
      supabaseAdmin
        .from("companies")
        .select("id, organization_id, totvs_coligada_id, totvs_filial_id, totvs_connection_key")
        .eq("organization_id", organizationId),
    ]);
    if (organization.error) throw organization.error;
    if (companies.error) throw companies.error;
    const scopes = resolveTotvsCompanyScopes(
      {
        mode: organization.data.totvs_structure_mode as TotvsStructureMode,
        mainColigadaId: organization.data.totvs_main_coligada_id,
        homologationMode: Boolean(organization.data.totvs_homologation_mode),
      },
      (companies.data ?? []).map((company) => ({
        id: company.id,
        organizationId: company.organization_id,
        connectionKey: company.totvs_connection_key,
        coligadaId: company.totvs_coligada_id,
        filialId: company.totvs_filial_id,
      })),
      this.sqlServer.defaultKey(),
    );
    if (!companyId) return scopes;
    const scope = scopes.find((item) => item.companyId === companyId);
    if (!scope)
      throw new NotFoundException(
        "Empresa sem contexto TOTVS completo para o modo configurado na conta.",
      );
    return [scope];
  }

  async effectiveConnectionKey(organizationId: string, baseKey?: string): Promise<string> {
    const organization = await supabaseAdmin
      .from("organizations")
      .select("totvs_homologation_mode")
      .eq("id", organizationId)
      .single();
    if (organization.error) throw organization.error;
    return effectiveTotvsConnectionKey(
      baseKey ?? this.sqlServer.defaultKey(),
      Boolean(organization.data.totvs_homologation_mode),
    );
  }

  async company(organizationId: string, companyId: string): Promise<TotvsCompanyScope> {
    return (await this.resolve(organizationId, companyId))[0];
  }
}

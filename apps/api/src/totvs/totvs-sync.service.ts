import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TOTVS_PENDING_SCHEMA_ENTITIES, TOTVS_READ_QUERIES, type TotvsQueryDefinition } from "./totvs-queries";
import { TotvsSqlServerService } from "./totvs-sql-server.service";

type JsonRecord = Record<string, string | number | boolean | null>;
type CompanyMap = Map<number, { id: string; organization_id: string }>;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function date(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function jsonRecord(row: Record<string, unknown>): JsonRecord {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (value instanceof Date) return [key, value.toISOString()];
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) return [key, value as string | number | boolean | null];
    return [key, String(value)];
  }));
}

function hash(payload: JsonRecord): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function initialSyncDate(): Date {
  const configured = new Date(process.env.TOTVS_INITIAL_SYNC_DATE ?? "2000-01-01T00:00:00.000Z");
  return Number.isNaN(configured.getTime()) ? new Date("2000-01-01T00:00:00.000Z") : configured;
}

function documentVariants(value: string): string[] {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 14) {
    return [digits, digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")];
  }
  if (digits.length === 11) {
    return [digits, digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")];
  }
  return [digits];
}

@Injectable()
export class TotvsSyncService {
  constructor(private readonly sqlServer: TotvsSqlServerService) {}

  private async companyMap(organizationId: string): Promise<CompanyMap> {
    const result = await supabaseAdmin.from("companies")
      .select("id, organization_id, totvs_coligada_id")
      .eq("organization_id", organizationId)
      .not("totvs_coligada_id", "is", null);
    if (result.error) throw result.error;
    return new Map((result.data ?? []).map((company) => [Number(company.totvs_coligada_id), {
      id: company.id,
      organization_id: company.organization_id,
    }]));
  }

  private async since(organizationId: string, definition: TotvsQueryDefinition, safetyWindowDays: number): Promise<Date> {
    if (!definition.incremental) return initialSyncDate();
    const checkpoint = await supabaseAdmin.from("totvs_sync_checkpoints")
      .select("source_watermark")
      .eq("organization_id", organizationId)
      .eq("entity", definition.entity)
      .maybeSingle();
    if (checkpoint.error) throw checkpoint.error;
    const watermark = date(checkpoint.data?.source_watermark) ?? initialSyncDate();
    return new Date(watermark.getTime() - safetyWindowDays * 86_400_000);
  }

  private async persistReferences(organizationId: string, definition: TotvsQueryDefinition, rows: Record<string, unknown>[]) {
    const now = new Date().toISOString();
    const records = rows.map((row) => {
      const payload = jsonRecord(row);
      return {
        organization_id: organizationId,
        entity: definition.entity,
        coligada_id: number(row.coligada ?? row.codcoligada) ?? 0,
        external_key: definition.externalKey(row),
        name: definition.displayName(row),
        active: text(row.ativo).toUpperCase() !== "N",
        source_updated_at: date(row.source_updated_at)?.toISOString() ?? null,
        payload,
        payload_hash: hash(payload),
        synced_at: now,
      };
    }).filter((record) => record.external_key.length > 0);
    for (let offset = 0; offset < records.length; offset += 250) {
      const result = await supabaseAdmin.from("totvs_reference_records")
        .upsert(records.slice(offset, offset + 250), { onConflict: "organization_id,entity,coligada_id,external_key" });
      if (result.error) throw result.error;
    }
  }

  private async materializeSuppliers(organizationId: string, rows: Record<string, unknown>[], companies: CompanyMap) {
    let materialized = 0;
    for (const row of rows) {
      const company = companies.get(Number(row.coligada));
      const document = text(row.cpf_cnpj).replace(/\D/g, "");
      if (!company || !document) continue;
      const code = text(row.codigo);
      const existing = await supabaseAdmin.from("suppliers")
        .select("id, erp_metadata, origem")
        .eq("organization_id", organizationId)
        .eq("company_id", company.id)
        .in("cnpj_cpf", documentVariants(document))
        .maybeSingle();
      if (existing.error) throw existing.error;
      const values = {
        organization_id: organizationId,
        company_id: company.id,
        cnpj_cpf: document,
        tipo_pessoa: Number(row.tipo_pessoa_id) === 1 ? "fisica" : "juridica",
        razao_social: text(row.razao_social) || document,
        nome_fantasia: text(row.fantasia) || null,
        inscricao_estadual: text(row.ie) || null,
        email: text(row.email) || null,
        telefone: text(row.telefone) || null,
        erp_system: "totvs_rm",
        erp_code: code,
        erp_external_id: `${row.coligada}|${code}`,
        erp_metadata: { ...(existing.data?.erp_metadata && typeof existing.data.erp_metadata === "object" ? existing.data.erp_metadata : {}), totvs: jsonRecord(row) },
        erp_synced_at: new Date().toISOString(),
        origem: existing.data?.origem ?? "erp",
      };
      const result = existing.data
        ? await supabaseAdmin.from("suppliers").update(values).eq("id", existing.data.id)
        : await supabaseAdmin.from("suppliers").insert(values);
      if (result.error) throw result.error;
      materialized += 1;
    }
    return materialized;
  }

  private async materializeAddresses(organizationId: string, rows: Record<string, unknown>[], companies: CompanyMap) {
    let materialized = 0;
    for (const row of rows) {
      if (text(row.tipo) !== "Principal") continue;
      const company = companies.get(Number(row.coligada));
      if (!company) continue;
      const result = await supabaseAdmin.from("suppliers").update({
        logradouro: text(row.rua) || null,
        numero: text(row.numero) || null,
        complemento: text(row.complemento) || null,
        bairro: text(row.bairro) || null,
        municipio: text(row.cidade) || null,
        uf: text(row.uf) || null,
        cep: text(row.cep).replace(/\D/g, "") || null,
        erp_synced_at: new Date().toISOString(),
      }).eq("organization_id", organizationId).eq("company_id", company.id).eq("erp_system", "totvs_rm").eq("erp_code", text(row.codigo));
      if (result.error) throw result.error;
      materialized += 1;
    }
    return materialized;
  }

  private async materializeCostCenters(organizationId: string, rows: Record<string, unknown>[], companies: CompanyMap) {
    let materialized = 0;
    for (const row of rows) {
      const company = companies.get(Number(row.coligada));
      if (!company) continue;
      const code = text(row.codigo);
      const existing = await supabaseAdmin.from("centros_custo")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("company_id", company.id)
        .eq("codigo", code)
        .maybeSingle();
      if (existing.error) throw existing.error;
      const values = { organization_id: organizationId, company_id: company.id, codigo: code, descricao: text(row.nome) || code, ativo: text(row.ativo) !== "N" };
      const result = existing.data
        ? await supabaseAdmin.from("centros_custo").update(values).eq("id", existing.data.id)
        : await supabaseAdmin.from("centros_custo").insert(values);
      if (result.error) throw result.error;
      materialized += 1;
    }
    return materialized;
  }

  private async materializeProducts(organizationId: string, rows: Record<string, unknown>[], companies: CompanyMap) {
    let materialized = 0;
    for (const row of rows) {
      const company = companies.get(Number(row.coligada));
      if (!company) continue;
      const externalId = `${text(row.coligada)}|${text(row.id_product)}`;
      const code = text(row.code);
      if (!code || !text(row.id_product)) continue;
      let existing = await supabaseAdmin.from("produtos")
        .select("id, erp_metadata")
        .eq("organization_id", organizationId)
        .eq("company_id", company.id)
        .eq("erp_system", "totvs_rm")
        .eq("erp_external_id", externalId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        existing = await supabaseAdmin.from("produtos")
          .select("id, erp_metadata")
          .eq("organization_id", organizationId)
          .eq("company_id", company.id)
          .eq("codigo_interno", code)
          .maybeSingle();
        if (existing.error) throw existing.error;
      }
      const ncm = text(row.ncm_id).replace(/\D/g, "");
      const origin = Number(row.origin_indicator);
      const values = {
        organization_id: organizationId,
        company_id: company.id,
        codigo_interno: code,
        descricao: text(row.description) || text(row.fantasy_name) || code,
        unidade: text(row.sales_unit) || text(row.control_unit) || text(row.purchase_unit) || "UN",
        ean_gtin: text(row.external_barcode) || text(row.auxiliary_code) || null,
        ncm: /^\d{8}$/.test(ncm) ? ncm : "00000000",
        origem_mercadoria: Number.isInteger(origin) && origin >= 0 && origin <= 8 ? origin : 0,
        ativo: Number(row.inactive) !== 1,
        erp_system: "totvs_rm",
        erp_code: code,
        erp_external_id: externalId,
        erp_metadata: { ...(existing.data?.erp_metadata && typeof existing.data.erp_metadata === "object" ? existing.data.erp_metadata : {}), totvs: jsonRecord(row) },
        erp_synced_at: new Date().toISOString(),
      };
      const result = existing.data
        ? await supabaseAdmin.from("produtos").update(values).eq("id", existing.data.id)
        : await supabaseAdmin.from("produtos").insert(values);
      if (result.error) throw result.error;
      materialized += 1;
    }
    return materialized;
  }

  private async materializeFinancialPlan(organizationId: string, rows: Record<string, unknown>[], companies: CompanyMap) {
    const validRows = rows.map((row) => ({ code: text(row.code), description: text(row.description) }))
      .filter((row) => /^\d{2}(?:\.\d{3}(?:\.\d{4})?)?$/.test(row.code))
      .sort((a, b) => a.code.split(".").length - b.code.split(".").length || a.code.localeCompare(b.code));
    const parentCodes = new Set(validRows.map((row) => row.code.includes(".") ? row.code.slice(0, row.code.lastIndexOf(".")) : null).filter((value): value is string => Boolean(value)));
    let materialized = 0;
    for (const company of companies.values()) {
      const ids = new Map<string, string>();
      for (const row of validRows) {
        const parentCode = row.code.includes(".") ? row.code.slice(0, row.code.lastIndexOf(".")) : null;
        let parentId = parentCode ? ids.get(parentCode) ?? null : null;
        if (parentCode && !parentId) {
          const parent = await supabaseAdmin.from("plano_contas").select("id").eq("company_id", company.id).eq("codigo", parentCode).maybeSingle();
          if (parent.error) throw parent.error;
          parentId = parent.data?.id ?? null;
        }
        const existing = await supabaseAdmin.from("plano_contas").select("id").eq("company_id", company.id).eq("codigo", row.code).maybeSingle();
        if (existing.error) throw existing.error;
        const values = {
          organization_id: organizationId,
          company_id: company.id,
          conta_pai_id: parentId,
          codigo: row.code,
          descricao: row.description || row.code,
          ativo: true,
          permite_lancamentos: !parentCodes.has(row.code),
        };
        const result = existing.data
          ? await supabaseAdmin.from("plano_contas").update(values).eq("id", existing.data.id)
          : await supabaseAdmin.from("plano_contas").insert(values).select("id").single();
        if (result.error) throw result.error;
        ids.set(row.code, existing.data?.id ?? (result.data as { id: string }).id);
        materialized += 1;
      }
    }
    return materialized;
  }

  private async materialize(organizationId: string, definition: TotvsQueryDefinition, rows: Record<string, unknown>[], companies: CompanyMap) {
    if (definition.entity === "suppliers") return this.materializeSuppliers(organizationId, rows, companies);
    if (definition.entity === "supplier_addresses") return this.materializeAddresses(organizationId, rows, companies);
    if (definition.entity === "cost_centers") return this.materializeCostCenters(organizationId, rows, companies);
    if (definition.entity === "products") return this.materializeProducts(organizationId, rows, companies);
    if (definition.entity === "financial_plan") return this.materializeFinancialPlan(organizationId, rows, companies);
    return 0;
  }

  async execute(runId: string): Promise<Record<string, unknown>> {
    const run = await supabaseAdmin.from("totvs_sync_runs").select("organization_id").eq("id", runId).single();
    if (run.error) throw run.error;
    const organizationId = run.data.organization_id;
    await supabaseAdmin.from("totvs_sync_runs").update({ status: "running", started_at: new Date().toISOString(), error_message: null }).eq("id", runId);
    const metrics: Record<string, unknown> = {
      entities: {},
      pending_schema_confirmation: TOTVS_PENDING_SCHEMA_ENTITIES,
      coligadas: [],
    };

    try {
      const settings = await supabaseAdmin.from("totvs_settings")
        .select("enabled, read_sync_enabled, safety_window_days")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (settings.error) throw settings.error;
      if (!settings.data?.enabled || !settings.data.read_sync_enabled) throw new Error("A sincronização de leitura TOTVS está desativada.");
      if (!this.sqlServer.configured()) throw new Error("As credenciais SQL Server do TOTVS RM não estão configuradas na API.");

      const companies = await this.companyMap(organizationId);
      const allowedColigadas = this.sqlServer.coligadas();
      const configuredColigadas = [...companies.keys()];
      const coligadas = allowedColigadas.filter((id) => configuredColigadas.includes(id));
      if (coligadas.length === 0) throw new Error("Associe ao menos uma empresa APFiscal a uma coligada TOTVS permitida.");
      const coligadaSql = coligadas.join(",");
      metrics.coligadas = coligadas;

      for (const definition of TOTVS_READ_QUERIES) {
        const since = await this.since(organizationId, definition, settings.data.safety_window_days);
        await supabaseAdmin.from("totvs_sync_checkpoints").upsert({
          organization_id: organizationId,
          entity: definition.entity,
          last_attempt_at: new Date().toISOString(),
          last_error: null,
        }, { onConflict: "organization_id,entity" });
        try {
          const rows = await this.sqlServer.queryReadOnly<Record<string, unknown>>(definition.sql(coligadaSql), definition.incremental ? { since } : {});
          await this.persistReferences(organizationId, definition, rows);
          const materialized = await this.materialize(organizationId, definition, rows, companies);
          const watermark = definition.updatedAtField
            ? rows.map((row) => date(row[definition.updatedAtField!])).filter((value): value is Date => value !== null).sort((a, b) => b.getTime() - a.getTime())[0]
            : new Date();
          const checkpoint = await supabaseAdmin.from("totvs_sync_checkpoints").upsert({
            organization_id: organizationId,
            entity: definition.entity,
            last_success_at: new Date().toISOString(),
            source_watermark: (watermark ?? new Date()).toISOString(),
            rows_processed: rows.length,
            last_error: null,
          }, { onConflict: "organization_id,entity" });
          if (checkpoint.error) throw checkpoint.error;
          (metrics.entities as Record<string, unknown>)[definition.entity] = { read: rows.length, materialized, since: definition.incremental ? since.toISOString() : null };
        } catch (error) {
          const errorText = error instanceof Error ? error.message : "Falha não identificada.";
          await supabaseAdmin.from("totvs_sync_checkpoints").upsert({ organization_id: organizationId, entity: definition.entity, last_error: errorText }, { onConflict: "organization_id,entity" });
          throw new Error(`Falha em ${definition.entity}: ${errorText}`);
        }
      }
      const finished = new Date().toISOString();
      const update = await supabaseAdmin.from("totvs_sync_runs").update({ status: "succeeded", finished_at: finished, metrics }).eq("id", runId);
      if (update.error) throw update.error;
      return metrics;
    } catch (error) {
      await supabaseAdmin.from("totvs_sync_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        metrics,
        error_message: error instanceof Error ? error.message : "Falha não identificada.",
      }).eq("id", runId);
      throw error;
    }
  }
}

import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TOTVS_PENDING_SCHEMA_ENTITIES, TOTVS_READ_QUERIES, type TotvsQueryDefinition } from "./totvs-queries";
import { TotvsSqlServerService } from "./totvs-sql-server.service";
import {
  rowsForTotvsScope,
  sourceColigada,
  sourceColigadasForScopes,
  sourceFilial,
  type TotvsCompanyScope,
} from "./totvs-scope";
import { TotvsScopeService } from "./totvs-scope.service";

type JsonRecord = Record<string, string | number | boolean | null>;
type CompanyScopes = TotvsCompanyScope[];

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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== "{}" ? serialized : "Falha não identificada.";
  } catch {
    return "Falha não identificada.";
  }
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
  constructor(
    private readonly sqlServer: TotvsSqlServerService,
    private readonly scopes: TotvsScopeService,
  ) {}

  private async since(organizationId: string, connectionKey: string, definition: TotvsQueryDefinition, safetyWindowDays: number): Promise<Date> {
    if (!definition.incremental) return initialSyncDate();
    const checkpoint = await supabaseAdmin.from("totvs_sync_checkpoints")
      .select("source_watermark")
      .eq("organization_id", organizationId)
      .eq("connection_key", connectionKey)
      .eq("entity", definition.entity)
      .maybeSingle();
    if (checkpoint.error) throw checkpoint.error;
    const watermark = date(checkpoint.data?.source_watermark) ?? initialSyncDate();
    return new Date(watermark.getTime() - safetyWindowDays * 86_400_000);
  }

  private async persistReferences(organizationId: string, connectionKey: string, definition: TotvsQueryDefinition, rows: Record<string, unknown>[]) {
    if (!definition.incremental) {
      const stale = await supabaseAdmin
        .from("totvs_reference_records")
        .delete()
        .eq("organization_id", organizationId)
        .eq("connection_key", connectionKey)
        .eq("entity", definition.entity);
      if (stale.error) throw stale.error;
    }
    const now = new Date().toISOString();
    const records = rows.map((row) => {
      const payload = jsonRecord(row);
      return {
        organization_id: organizationId,
        connection_key: connectionKey,
        entity: definition.entity,
        coligada_id: number(row.coligada ?? row.codcoligada) ?? 0,
        filial_id: sourceFilial(row) ?? 0,
        external_key: definition.externalKey(row),
        name: definition.displayName(row),
        active: row.inactive == null ? text(row.ativo).toUpperCase() !== "N" : Number(row.inactive) !== 1,
        source_updated_at: date(row.source_updated_at)?.toISOString() ?? null,
        payload,
        payload_hash: hash(payload),
        synced_at: now,
      };
    }).filter((record) => record.external_key.length > 0);
    const deduplicated = [...new Map(records.map((record) => [
      `${record.coligada_id}|${record.filial_id}|${record.external_key}`,
      record,
    ])).values()];
    for (let offset = 0; offset < deduplicated.length; offset += 250) {
      const result = await supabaseAdmin.from("totvs_reference_records")
        .upsert(deduplicated.slice(offset, offset + 250), {
          onConflict: "organization_id,connection_key,entity,coligada_id,filial_id,external_key",
        });
      if (result.error) throw result.error;
    }
  }

  private async materializeSuppliers(organizationId: string, rows: Record<string, unknown>[], companies: CompanyScopes) {
    let materialized = 0;
    for (const company of companies) {
      const companyRows = rowsForTotvsScope(rows, company, (row) => text(row.codigo), false);
      for (const row of companyRows) {
        const document = text(row.cpf_cnpj).replace(/\D/g, "");
        if (!document) continue;
        const code = text(row.codigo);
        const existing = await supabaseAdmin.from("suppliers")
          .select("id, erp_metadata, origem")
          .eq("organization_id", organizationId)
          .eq("company_id", company.companyId)
          .in("cnpj_cpf", documentVariants(document))
          .maybeSingle();
        if (existing.error) throw existing.error;
        const values = {
          organization_id: organizationId,
          company_id: company.companyId,
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
    }
    return materialized;
  }

  private async materializeAddresses(organizationId: string, rows: Record<string, unknown>[], companies: CompanyScopes) {
    let materialized = 0;
    for (const company of companies) {
      const companyRows = rowsForTotvsScope(
        rows,
        company,
        (row) => `${text(row.codigo)}|${text(row.tipo)}`,
        false,
      );
      for (const row of companyRows) {
        if (text(row.tipo) !== "Principal") continue;
        const result = await supabaseAdmin.from("suppliers").update({
          logradouro: text(row.rua) || null,
          numero: text(row.numero) || null,
          complemento: text(row.complemento) || null,
          bairro: text(row.bairro) || null,
          municipio: text(row.cidade) || null,
          uf: text(row.uf) || null,
          cep: text(row.cep).replace(/\D/g, "") || null,
          erp_synced_at: new Date().toISOString(),
        }).eq("organization_id", organizationId).eq("company_id", company.companyId).eq("erp_system", "totvs_rm").eq("erp_code", text(row.codigo));
        if (result.error) throw result.error;
        materialized += 1;
      }
    }
    return materialized;
  }

  private async materializeCostCenters(organizationId: string, rows: Record<string, unknown>[], companies: CompanyScopes) {
    let materialized = 0;
    for (const company of companies) {
      const companyRows = rowsForTotvsScope(rows, company, (row) => text(row.codigo), false);
      for (const row of companyRows) {
        const code = text(row.codigo);
        const existing = await supabaseAdmin.from("centros_custo")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("company_id", company.companyId)
          .eq("codigo", code)
          .maybeSingle();
        if (existing.error) throw existing.error;
        const values = { organization_id: organizationId, company_id: company.companyId, codigo: code, descricao: text(row.nome) || code, ativo: text(row.ativo) !== "N" };
        const result = existing.data
          ? await supabaseAdmin.from("centros_custo").update(values).eq("id", existing.data.id)
          : await supabaseAdmin.from("centros_custo").insert(values);
        if (result.error) throw result.error;
        materialized += 1;
      }
    }
    return materialized;
  }

  private async materializeProductClassifications(organizationId: string, rows: Record<string, unknown>[], companies: CompanyScopes) {
    const tables = ["familias", "grupos", "subgrupos"] as const;
    let materialized = 0;
    for (const company of companies) {
      const companyRows = rowsForTotvsScope(rows, company, (row) => text(row.code), false);
      for (let level = 1; level <= tables.length; level += 1) {
        const table = tables[level - 1];
        const levelRows = companyRows.filter((row) => text(row.code) && text(row.code).split(".").length === level);
        for (let offset = 0; offset < levelRows.length; offset += 250) {
          const chunk = levelRows.slice(offset, offset + 250);
          const codes = [...new Set(chunk.map((row) => text(row.code)))];
          const existing = await supabaseAdmin.from(table).select("id, codigo").eq("company_id", company.companyId).in("codigo", codes);
          if (existing.error) throw existing.error;
          const ids = new Map((existing.data ?? []).map((row) => [row.codigo, row.id]));
          const records = chunk.map((row) => ({
            id: ids.get(text(row.code)) ?? randomUUID(),
            organization_id: organizationId,
            company_id: company.companyId,
            codigo: text(row.code),
            descricao: text(row.description) || text(row.code),
          }));
          const result = await supabaseAdmin.from(table).upsert(records, { onConflict: "id" });
          if (result.error) throw result.error;
          materialized += records.length;
        }
      }
    }
    return materialized;
  }

  private async ensureProductClassificationLinks(organizationId: string, companyId: string, rows: Record<string, unknown>[]) {
    const tables = ["familias", "grupos", "subgrupos"] as const;
    const maps: Array<Map<string, string>> = [];
    for (let level = 1; level <= tables.length; level += 1) {
      const candidates = new Map<string, { description: string; exact: boolean }>();
      for (const row of rows) {
        const code = text(row.code);
        const parts = code.split(".");
        if (!code || parts.length < level) continue;
        const prefix = parts.slice(0, level).join(".");
        const exact = code === prefix;
        if (!candidates.has(prefix) || exact) {
          candidates.set(prefix, { description: exact ? text(row.description) || prefix : prefix, exact });
        }
      }
      const table = tables[level - 1];
      const existing = await supabaseAdmin.from(table).select("id, codigo").eq("company_id", companyId);
      if (existing.error) throw existing.error;
      const ids = new Map((existing.data ?? []).map((row) => [row.codigo, row.id]));
      const missing = [...candidates.entries()].filter(([code]) => !ids.has(code));
      for (let offset = 0; offset < missing.length; offset += 250) {
        const records = missing.slice(offset, offset + 250).map(([code, candidate]) => ({
          id: randomUUID(),
          organization_id: organizationId,
          company_id: companyId,
          codigo: code,
          descricao: candidate.description,
        }));
        const result = await supabaseAdmin.from(table).insert(records).select("id, codigo");
        if (result.error) throw result.error;
        for (const row of result.data ?? []) ids.set(row.codigo, row.id);
      }
      maps.push(ids);
    }
    return { familyIds: maps[0], groupIds: maps[1], subgroupIds: maps[2] };
  }

  private async materializeProducts(organizationId: string, rows: Record<string, unknown>[], companies: CompanyScopes) {
    let materialized = 0;
    for (const company of companies) {
      const companyRows = rowsForTotvsScope(rows, company, (row) => text(row.code), false)
        .filter((row) => text(row.code) && text(row.id_product));
      const { familyIds, groupIds, subgroupIds } = await this.ensureProductClassificationLinks(organizationId, company.companyId, companyRows);

      for (let offset = 0; offset < companyRows.length; offset += 200) {
        const chunk = companyRows.slice(offset, offset + 200);
        const codes = [...new Set(chunk.map((row) => text(row.code)))];
        const existing = await supabaseAdmin.from("produtos")
          .select("id, codigo_interno, erp_metadata")
          .eq("company_id", company.companyId)
          .in("codigo_interno", codes);
        if (existing.error) throw existing.error;
        const byCode = new Map((existing.data ?? []).map((row) => [row.codigo_interno, row]));
        const now = new Date().toISOString();
        const records = chunk.map((row) => {
          const code = text(row.code);
          const current = byCode.get(code);
          const parts = code.split(".");
          const ncm = text(row.ncm).replace(/\D/g, "");
          const origin = Number(row.origin_indicator);
          return {
            id: current?.id ?? randomUUID(),
            organization_id: organizationId,
            company_id: company.companyId,
            codigo_interno: code,
            descricao: text(row.description) || text(row.fantasy_name) || code,
            unidade: text(row.sales_unit) || text(row.control_unit) || text(row.purchase_unit) || "UN",
            ean_gtin: text(row.external_barcode) || text(row.auxiliary_code) || null,
            ncm: /^\d{8}$/.test(ncm) ? ncm : "00000000",
            origem_mercadoria: Number.isInteger(origin) && origin >= 0 && origin <= 8 ? origin : 0,
            familia_id: familyIds.get(parts[0]) ?? null,
            grupo_id: groupIds.get(parts.slice(0, 2).join(".")) ?? null,
            subgrupo_id: subgroupIds.get(parts.slice(0, 3).join(".")) ?? null,
            ativo: Number(row.inactive) !== 1,
            erp_system: "totvs_rm",
            erp_code: code,
            erp_external_id: `${row.coligada}|${text(row.id_product)}`,
            erp_metadata: { ...(current?.erp_metadata && typeof current.erp_metadata === "object" ? current.erp_metadata : {}), totvs: jsonRecord(row) },
            erp_synced_at: now,
          };
        });
        const result = await supabaseAdmin.from("produtos").upsert(records, { onConflict: "id" });
        if (result.error) throw result.error;
        materialized += records.length;
      }
    }
    return materialized;
  }

  private async materializeStockLocations(organizationId: string, rows: Record<string, unknown>[], companies: CompanyScopes) {
    let materialized = 0;
    for (const company of companies) {
      const companyRows = rowsForTotvsScope(rows, company, (row) => text(row.code), true)
        .filter((row) => text(row.code));
      if (company.mode === "FILIAL") {
        const validCodes = new Set(companyRows.map((row) => text(row.code)));
        const foreignCodes = [...new Set(rows
          .filter((row) =>
            sourceColigada(row) === company.codColigada
            && sourceFilial(row) !== null
            && sourceFilial(row) !== company.codFilial,
          )
          .map((row) => text(row.code))
          .filter((code) => code && !validCodes.has(code)))];
        for (let offset = 0; offset < foreignCodes.length; offset += 250) {
          const result = await supabaseAdmin
            .from("locais_estoque")
            .update({ ativo: false })
            .eq("company_id", company.companyId)
            .in("codigo", foreignCodes.slice(offset, offset + 250));
          if (result.error) throw result.error;
        }
      }
      for (let offset = 0; offset < companyRows.length; offset += 250) {
        const chunk = companyRows.slice(offset, offset + 250);
        const codes = [...new Set(chunk.map((row) => text(row.code)))];
        const existing = await supabaseAdmin.from("locais_estoque").select("id, codigo").eq("company_id", company.companyId).in("codigo", codes);
        if (existing.error) throw existing.error;
        const ids = new Map((existing.data ?? []).map((row) => [row.codigo, row.id]));
        const records = chunk.map((row) => ({
          id: ids.get(text(row.code)) ?? randomUUID(),
          organization_id: organizationId,
          company_id: company.companyId,
          codigo: text(row.code),
          descricao: text(row.description) || text(row.code),
          tipo: Number(row.stock_level) > 0 ? "analitico" : "sintetico",
          codigo_pai_id: null,
          ativo: Number(row.inactive) !== 1,
        }));
        const result = await supabaseAdmin.from("locais_estoque").upsert(records, { onConflict: "id" });
        if (result.error) throw result.error;
        materialized += records.length;
      }
    }
    return materialized;
  }

  private async materializeFinancialPlan(organizationId: string, rows: Record<string, unknown>[], companies: CompanyScopes) {
    const validRows = rows.map((row) => ({ code: text(row.code), description: text(row.description) }))
      .filter((row) => /^\d{2}(?:\.\d{3}(?:\.\d{4})?)?$/.test(row.code))
      .sort((a, b) => a.code.split(".").length - b.code.split(".").length || a.code.localeCompare(b.code));
    const parentCodes = new Set(validRows.map((row) => row.code.includes(".") ? row.code.slice(0, row.code.lastIndexOf(".")) : null).filter((value): value is string => Boolean(value)));
    let materialized = 0;
    for (const company of companies) {
      const ids = new Map<string, string>();
      for (const row of validRows) {
        const parentCode = row.code.includes(".") ? row.code.slice(0, row.code.lastIndexOf(".")) : null;
        let parentId = parentCode ? ids.get(parentCode) ?? null : null;
        if (parentCode && !parentId) {
          const parent = await supabaseAdmin.from("plano_contas").select("id").eq("company_id", company.companyId).eq("codigo", parentCode).maybeSingle();
          if (parent.error) throw parent.error;
          parentId = parent.data?.id ?? null;
        }
        const existing = await supabaseAdmin.from("plano_contas").select("id").eq("company_id", company.companyId).eq("codigo", row.code).maybeSingle();
        if (existing.error) throw existing.error;
        const values = {
          organization_id: organizationId,
          company_id: company.companyId,
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

  private async materializeMovementTypes(
    organizationId: string,
    connectionKey: string,
    rows: Record<string, unknown>[],
    companies: CompanyScopes,
  ) {
    let materialized = 0;
    for (const company of companies) {
      const companyRows = rowsForTotvsScope(rows, company, (row) => text(row.code), false).filter(
        (row) => text(row.code),
      );
      const inactive = await supabaseAdmin
        .from("tipos_movimento_totvs")
        .update({ ativo: false, synced_at: new Date().toISOString() })
        .eq("company_id", company.companyId);
      if (inactive.error) throw inactive.error;
      for (let offset = 0; offset < companyRows.length; offset += 250) {
        const now = new Date().toISOString();
        const records = companyRows.slice(offset, offset + 250).map((row) => ({
          organization_id: organizationId,
          company_id: company.companyId,
          connection_key: connectionKey,
          coligada_id: company.codColigada,
          codigo: text(row.code),
          descricao: text(row.description) || text(row.code),
          ativo: true,
          synced_at: now,
          updated_at: now,
        }));
        const result = await supabaseAdmin
          .from("tipos_movimento_totvs")
          .upsert(records, { onConflict: "company_id,codigo" });
        if (result.error) throw result.error;
        materialized += records.length;
      }
    }
    return materialized;
  }

  private async materialize(organizationId: string, definition: TotvsQueryDefinition, rows: Record<string, unknown>[], companies: CompanyScopes) {
    if (definition.entity === "suppliers") return this.materializeSuppliers(organizationId, rows, companies);
    if (definition.entity === "supplier_addresses") return this.materializeAddresses(organizationId, rows, companies);
    if (definition.entity === "cost_centers") return this.materializeCostCenters(organizationId, rows, companies);
    if (definition.entity === "product_classifications") return this.materializeProductClassifications(organizationId, rows, companies);
    if (definition.entity === "products") return this.materializeProducts(organizationId, rows, companies);
    if (definition.entity === "financial_plan") return this.materializeFinancialPlan(organizationId, rows, companies);
    if (definition.entity === "stock_locations") return this.materializeStockLocations(organizationId, rows, companies);
    if (definition.entity === "movement_types")
      return this.materializeMovementTypes(
        organizationId,
        companies[0]?.connectionKey ?? this.sqlServer.defaultKey(),
        rows,
        companies,
      );
    return 0;
  }

  async execute(runId: string): Promise<Record<string, unknown>> {
    const run = await supabaseAdmin.from("totvs_sync_runs").select("organization_id, connection_key").eq("id", runId).single();
    if (run.error) throw run.error;
    const organizationId = run.data.organization_id;
    const connectionKey = run.data.connection_key || this.sqlServer.defaultKey();
    await supabaseAdmin.from("totvs_sync_runs").update({ status: "running", started_at: new Date().toISOString(), error_message: null }).eq("id", runId);
    const metrics: Record<string, unknown> = {
      entities: {},
      pending_schema_confirmation: TOTVS_PENDING_SCHEMA_ENTITIES,
      connection_key: connectionKey,
      coligadas: [],
      errors: [],
    };

    try {
      const settings = await supabaseAdmin.from("totvs_settings")
        .select("enabled, read_sync_enabled, safety_window_days")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (settings.error) throw settings.error;
      if (!settings.data?.enabled || !settings.data.read_sync_enabled) throw new Error("A sincronização de leitura TOTVS está desativada.");
      if (!this.sqlServer.configured(connectionKey)) throw new Error(`As credenciais da conexão TOTVS ${connectionKey} não estão configuradas na API.`);

      const companies = (await this.scopes.resolve(organizationId)).filter(
        (scope) => scope.connectionKey === connectionKey,
      );
      const allowedColigadas = this.sqlServer.coligadas(connectionKey);
      const configuredColigadas = [...new Set(companies.map((company) => company.codColigada))];
      const coligadas = allowedColigadas.filter((id) => configuredColigadas.includes(id));
      if (coligadas.length === 0) throw new Error("Associe ao menos uma empresa APFiscal a uma coligada TOTVS permitida.");
      const sourceColigadas = sourceColigadasForScopes(companies);
      const coligadaSql = sourceColigadas.join(",");
      metrics.coligadas = coligadas;
      metrics.source_coligadas = sourceColigadas;

      for (const definition of TOTVS_READ_QUERIES) {
        const since = await this.since(organizationId, connectionKey, definition, settings.data.safety_window_days);
        await supabaseAdmin.from("totvs_sync_checkpoints").upsert({
          organization_id: organizationId,
          connection_key: connectionKey,
          entity: definition.entity,
          last_attempt_at: new Date().toISOString(),
          last_error: null,
        }, { onConflict: "organization_id,connection_key,entity" });
        try {
          const rows = await this.sqlServer.queryReadOnly<Record<string, unknown>>(definition.sql(coligadaSql), definition.incremental ? { since } : {}, connectionKey);
          await this.persistReferences(organizationId, connectionKey, definition, rows);
          const materialized = await this.materialize(organizationId, definition, rows, companies);
          const watermark = definition.updatedAtField
            ? rows.map((row) => date(row[definition.updatedAtField!])).filter((value): value is Date => value !== null).sort((a, b) => b.getTime() - a.getTime())[0]
            : new Date();
          const checkpoint = await supabaseAdmin.from("totvs_sync_checkpoints").upsert({
            organization_id: organizationId,
            connection_key: connectionKey,
            entity: definition.entity,
            last_success_at: new Date().toISOString(),
            source_watermark: (watermark ?? new Date()).toISOString(),
            rows_processed: rows.length,
            last_error: null,
          }, { onConflict: "organization_id,connection_key,entity" });
          if (checkpoint.error) throw checkpoint.error;
          (metrics.entities as Record<string, unknown>)[definition.entity] = { read: rows.length, materialized, since: definition.incremental ? since.toISOString() : null };
        } catch (error) {
          const errorText = errorMessage(error);
          await supabaseAdmin.from("totvs_sync_checkpoints").upsert({ organization_id: organizationId, connection_key: connectionKey, entity: definition.entity, last_error: errorText }, { onConflict: "organization_id,connection_key,entity" });
          (metrics.entities as Record<string, unknown>)[definition.entity] = { read: 0, materialized: 0, error: errorText };
          (metrics.errors as Array<Record<string, string>>).push({ entity: definition.entity, message: errorText });
        }
      }
      const finished = new Date().toISOString();
      const errors = metrics.errors as Array<Record<string, string>>;
      const update = await supabaseAdmin.from("totvs_sync_runs").update({
        status: errors.length ? "partial" : "succeeded",
        finished_at: finished,
        metrics,
        error_message: errors.length ? errors.map((entry) => `${entry.entity}: ${entry.message}`).join(" | ").slice(0, 4000) : null,
      }).eq("id", runId);
      if (update.error) throw update.error;
      return metrics;
    } catch (error) {
      await supabaseAdmin.from("totvs_sync_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        metrics,
        error_message: errorMessage(error),
      }).eq("id", runId);
      throw error;
    }
  }
}

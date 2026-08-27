import { Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsRmWriterService, type RmDocument, type RmItem } from "./totvs-rm-writer.service";
import { TotvsSqlServerService } from "./totvs-sql-server.service";
import { TotvsScopeService } from "./totvs-scope.service";

type RelatedCode = { codigo?: string | null } | null;
function setting(key: string, suffix: string, fallback: string) {
  return (
    process.env[`TOTVS_CONNECTION_${key}_${suffix}`]?.trim() ||
    process.env[`TOTVS_${suffix}`]?.trim() ||
    fallback
  );
}

function positiveIntegerSetting(key: string, suffix: string, fallback: number) {
  const value = Number(setting(key, suffix, String(fallback)));
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `A configuração TOTVS_CONNECTION_${key}_${suffix} deve ser um número inteiro positivo.`,
    );
  }
  return value;
}

@Injectable()
export class TotvsIntegrationService {
  constructor(
    private readonly sqlServer: TotvsSqlServerService,
    private readonly scopes: TotvsScopeService,
    private readonly writer: TotvsRmWriterService,
  ) {}

  async execute(runId: string) {
    const run = await supabaseAdmin
      .from("totvs_integration_runs")
      .select(
        "id, fiscal_document_id, organization_id, company_id, connection_key, attempt, created_at",
      )
      .eq("id", runId)
      .single();
    if (run.error) throw run.error;
    await supabaseAdmin
      .from("totvs_integration_runs")
      .update({
        status: "validating",
        attempt: run.data.attempt + 1,
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", runId);

    try {
      const [document, items, headerAllocations] = await Promise.all([
        supabaseAdmin
          .from("fiscal_documents")
          .select(
            "*, companies(id, organization_id), suppliers:supplier_id(id, cnpj_cpf, razao_social, nome_fantasia, inscricao_estadual, inscricao_municipal, logradouro, numero, complemento, bairro, cep, municipio, uf, telefone, email, tipo_pessoa, erp_system, erp_code, erp_external_id), plano_contas:plano_contas_id(codigo), tipos_compra:tipo_compra_id(codigo)",
          )
          .eq("id", run.data.fiscal_document_id)
          .single(),
        supabaseAdmin
          .from("fiscal_document_items")
          .select(
            "*, produtos(id, codigo_interno, descricao, unidade, ncm, erp_code), locais_estoque:local_estoque_id(codigo), tipos_compra:tipo_compra_id(codigo)",
          )
          .eq("document_id", run.data.fiscal_document_id)
          .order("numero_item"),
        supabaseAdmin
          .from("nfe_centro_custo")
          .select("centro_custo_id, valor, centros_custo(codigo, descricao)")
          .eq("document_id", run.data.fiscal_document_id),
      ]);
      if (document.error) throw document.error;
      if (items.error) throw items.error;
      if (headerAllocations.error) throw headerAllocations.error;
      const itemIds = (items.data ?? []).map((item) => item.id);
      const itemAllocations = itemIds.length
        ? await supabaseAdmin
            .from("nfe_item_centro_custo")
            .select("document_item_id, centro_custo_id, valor, centros_custo(codigo, descricao)")
            .in("document_item_id", itemIds)
        : { data: [], error: null };
      if (itemAllocations.error) throw itemAllocations.error;
      if (document.data.status !== "pronta_para_integracao")
        throw new Error(
          "O documento fiscal precisa estar pronto para integração antes de entrar no TOTVS RM.",
        );

      const resolved = await this.scopes.company(run.data.organization_id, run.data.company_id);
      const scope = {
        ...resolved,
        connectionKey: run.data.connection_key ?? resolved.connectionKey,
      };
      const isNfse = document.data.tipo === "nfse";
      const unlinked = (items.data ?? []).filter((item) => !item.product_id);
      if (!isNfse && unlinked.length)
        throw new Error(`${unlinked.length} item(ns) não possuem produto vinculado.`);

      const headerCostCenter = (headerAllocations.data ?? [])[0]?.centros_custo as RelatedCode;
      const headerRates = (headerAllocations.data ?? []).flatMap((allocation) => {
        const code = (allocation.centros_custo as RelatedCode)?.codigo;
        return code ? [{ costCenterCode: code, value: Number(allocation.valor) }] : [];
      });
      const itemRates = new Map<string, Array<{ costCenterCode: string; value: number }>>();
      for (const allocation of (itemAllocations.data ?? []) as Array<{
        document_item_id: string;
        valor: number;
        centros_custo: RelatedCode;
      }>) {
        const code = allocation.centros_custo?.codigo;
        if (!code) continue;
        const rates = itemRates.get(allocation.document_item_id) ?? [];
        rates.push({ costCenterCode: code, value: Number(allocation.valor) });
        itemRates.set(allocation.document_item_id, rates);
      }
      const rmItems: RmItem[] = isNfse
        ? [
            {
              numero_item: 1,
              codigo: document.data.service_code_municipal ?? document.data.numero,
              productErpCode: setting(scope.connectionKey, "NFSE_PRODUCT_CODE", "001.01.01.000001"),
              purchaseTypeCode: null,
              cfop: null,
              unidade_comercial: "SV",
              quantidade_comercial: 1,
              valor_unitario_comercial:
                document.data.service_gross_value ?? document.data.valor_total,
              valor_bruto: document.data.service_gross_value ?? document.data.valor_total,
              valor_desconto: document.data.unconditional_discount_value,
              valor_frete: 0,
              valor_seguro: 0,
              valor_outros: 0,
              valor_total: document.data.service_net_value ?? document.data.valor_total,
              localEstoqueCode: null,
              costCenterCode: headerCostCenter?.codigo ?? null,
              allocations: headerRates,
              taxes: {
                ISS: {
                  vBC: document.data.iss_base_value,
                  pISSQN: document.data.iss_rate,
                  vISSQN: document.data.iss_value,
                },
              },
            },
          ]
        : (items.data ?? []).map((item) => ({
            numero_item: item.numero_item,
            codigo: item.codigo,
            productErpCode: item.produtos!.erp_code ?? item.produtos!.codigo_interno,
            localProductId: item.produtos!.id,
            createProduct: !item.produtos!.erp_code,
            productDescription: item.produtos!.descricao,
            purchaseTypeCode:
              (item.tipos_compra as RelatedCode)?.codigo ??
              (document.data.tipos_compra as RelatedCode)?.codigo ??
              null,
            cfop: item.cfop,
            unidade_comercial: item.unidade_comercial,
            quantidade_comercial: item.quantidade_comercial,
            valor_unitario_comercial: item.valor_unitario_comercial,
            valor_bruto: item.valor_bruto,
            valor_desconto: item.valor_desconto,
            valor_frete: item.valor_frete,
            valor_seguro: item.valor_seguro,
            valor_outros: item.valor_outros,
            valor_total: item.valor_total,
            localEstoqueCode: (item.locais_estoque as RelatedCode)?.codigo ?? null,
            costCenterCode:
              itemRates.get(item.id)?.[0]?.costCenterCode ?? headerCostCenter?.codigo ?? null,
            allocations: itemRates.get(item.id) ?? headerRates,
            taxes: item.impostos,
          }));

      const payload = {
        schemaVersion: 2,
        connectionKey: scope.connectionKey,
        structureMode: scope.mode,
        coligada: scope.codColigada,
        filial: scope.codFilial,
        accessKey: document.data.chave_acesso,
        supplierCode: document.data.suppliers?.erp_code ?? null,
        document: document.data,
        items: rmItems,
        allocations: { header: headerAllocations.data ?? [], items: itemAllocations.data ?? [] },
      };
      await supabaseAdmin
        .from("totvs_integration_runs")
        .update({ request_payload: payload, status: "running" })
        .eq("id", runId);

      const issuer =
        document.data.emitente && typeof document.data.emitente === "object"
          ? (document.data.emitente as Record<string, unknown>)
          : {};
      const issuerAddressCandidate = issuer.enderEmit ?? issuer.endereco;
      const issuerAddress =
        issuerAddressCandidate && typeof issuerAddressCandidate === "object"
          ? (issuerAddressCandidate as Record<string, unknown>)
          : {};
      const issuerText = (...keys: string[]) => {
        for (const key of keys) {
          const value = issuerAddress[key] ?? issuer[key];
          if (typeof value === "string" && value.trim()) return value.trim();
        }
        return null;
      };

      const result = await this.sqlServer.writeTransaction(scope.connectionKey, (transaction) =>
        this.writer.write(transaction, {
          coligada: scope.codColigada,
          filial:
            scope.codFilial ?? positiveIntegerSetting(scope.connectionKey, "DEFAULT_FILIAL", 1),
          supplierCode: document.data.suppliers?.erp_code ?? null,
          supplierTaxId: document.data.emitente_cnpj ?? document.data.suppliers?.cnpj_cpf ?? "",
          supplier: {
            legalName: document.data.suppliers?.razao_social ?? document.data.emitente_nome,
            tradeName: document.data.suppliers?.nome_fantasia ?? document.data.emitente_nome,
            stateRegistration:
              document.data.suppliers?.inscricao_estadual ?? issuerText("IE", "ie"),
            municipalRegistration:
              document.data.suppliers?.inscricao_municipal ?? issuerText("IM", "im"),
            street: document.data.suppliers?.logradouro ?? issuerText("xLgr", "logradouro"),
            number: document.data.suppliers?.numero ?? issuerText("nro", "numero"),
            complement:
              document.data.suppliers?.complemento ?? issuerText("xCpl", "complemento"),
            district: document.data.suppliers?.bairro ?? issuerText("xBairro", "bairro"),
            zipCode: document.data.suppliers?.cep ?? issuerText("CEP", "cep"),
            city: document.data.suppliers?.municipio ?? issuerText("xMun", "municipio"),
            state: document.data.suppliers?.uf ?? issuerText("UF", "uf"),
            phone: document.data.suppliers?.telefone ?? issuerText("fone", "telefone"),
            email: document.data.suppliers?.email ?? issuerText("email"),
            personType: document.data.suppliers?.tipo_pessoa ?? null,
          },
          document: document.data as unknown as RmDocument,
          items: rmItems,
          costCenterCode: headerCostCenter?.codigo ?? null,
          allocations: headerRates,
          financialPlanCode: (document.data.plano_contas as RelatedCode)?.codigo ?? null,
          purchaseTypeCode: (document.data.tipos_compra as RelatedCode)?.codigo ?? null,
          integrationAt: run.data.created_at,
          nfeCodTmv: setting(scope.connectionKey, "NFE_ENTRY_CODTMV", "1.2.11"),
          nfseCodTmv: setting(scope.connectionKey, "NFSE_ENTRY_CODTMV", "1.2.30"),
          user: setting(scope.connectionKey, "INTEGRATION_USER", "APFISCAL"),
        }),
      );
      const finishedAt = new Date().toISOString();
      const [runUpdate, documentUpdate] = await Promise.all([
        supabaseAdmin
          .from("totvs_integration_runs")
          .update({
            status: "succeeded",
            rm_record_id: String(result.idMov),
            response_payload: result,
            error_message: null,
            finished_at: finishedAt,
          })
          .eq("id", runId),
        supabaseAdmin
          .from("fiscal_documents")
          .update({
            status: "integrado_totvs",
            status_observacao: `Integrado ao TOTVS RM no movimento ${result.idMov}.`,
            status_updated_at: finishedAt,
          })
          .eq("id", run.data.fiscal_document_id),
      ]);
      if (runUpdate.error) throw runUpdate.error;
      if (documentUpdate.error) throw documentUpdate.error;
      for (const product of result.createdProducts) {
        const productUpdate = await supabaseAdmin
          .from("produtos")
          .update({ erp_system: "totvs_rm", erp_code: product.erpCode, erp_synced_at: finishedAt })
          .eq("id", product.localProductId);
        if (productUpdate.error) throw productUpdate.error;
      }
      if (document.data.supplier_id && !document.data.suppliers?.erp_code && result.supplierCode) {
        const update = await supabaseAdmin
          .from("suppliers")
          .update({
            erp_system: "totvs_rm",
            erp_code: result.supplierCode,
            erp_synced_at: finishedAt,
          })
          .eq("id", document.data.supplier_id);
        if (update.error) throw update.error;
      }
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha não identificada na integração TOTVS.";
      await supabaseAdmin
        .from("totvs_integration_runs")
        .update({ status: "failed", finished_at: new Date().toISOString(), error_message: message })
        .eq("id", runId);
      throw error;
    }
  }
}

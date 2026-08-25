import { Injectable } from "@nestjs/common";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TotvsSqlServerService } from "./totvs-sql-server.service";
import { TotvsScopeService } from "./totvs-scope.service";

@Injectable()
export class TotvsIntegrationService {
  constructor(
    private readonly sqlServer: TotvsSqlServerService,
    private readonly scopes: TotvsScopeService,
  ) {}

  async execute(runId: string) {
    const run = await supabaseAdmin.from("totvs_integration_runs")
      .select("id, fiscal_document_id, organization_id, company_id, attempt")
      .eq("id", runId)
      .single();
    if (run.error) throw run.error;
    await supabaseAdmin.from("totvs_integration_runs").update({
      status: "validating",
      attempt: run.data.attempt + 1,
      started_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", runId);

    try {
      const [document, items, headerAllocations, itemAllocations] = await Promise.all([
        supabaseAdmin.from("fiscal_documents")
          .select("*, companies(id, organization_id), suppliers:supplier_id(id, erp_system, erp_code, erp_external_id)")
          .eq("id", run.data.fiscal_document_id)
          .single(),
        supabaseAdmin.from("fiscal_document_items")
          .select("*, produtos(id, codigo_interno, erp_code)")
          .eq("document_id", run.data.fiscal_document_id)
          .order("numero_item"),
        supabaseAdmin.from("nfe_centro_custo")
          .select("centro_custo_id, valor, centros_custo(codigo, descricao)")
          .eq("document_id", run.data.fiscal_document_id),
        supabaseAdmin.from("nfe_item_centro_custo")
          .select("item_id, centro_custo_id, valor, centros_custo(codigo, descricao)")
          .eq("document_id", run.data.fiscal_document_id),
      ]);
      if (document.error) throw document.error;
      if (items.error) throw items.error;
      if (headerAllocations.error) throw headerAllocations.error;
      if (itemAllocations.error) throw itemAllocations.error;
      if (document.data.status !== "pronta_para_integracao") throw new Error("A NF-e precisa estar pronta para integração antes de entrar no TOTVS RM.");
      const scope = await this.scopes.company(run.data.organization_id, run.data.company_id);
      if (!document.data.suppliers?.erp_code) throw new Error("O fornecedor não possui código CODCFO do TOTVS RM.");
      const unlinkedItems = (items.data ?? []).filter((item) => !item.product_id || !item.produtos?.erp_code);
      if (unlinkedItems.length > 0) throw new Error(`${unlinkedItems.length} item(ns) não possuem produto/código TOTVS vinculado.`);

      const payload = {
        schemaVersion: 1,
        connectionKey: scope.connectionKey,
        structureMode: scope.mode,
        coligada: scope.codColigada,
        filial: scope.codFilial,
        accessKey: document.data.chave_acesso,
        supplierCode: document.data.suppliers.erp_code,
        document: document.data,
        items: items.data ?? [],
        allocations: { header: headerAllocations.data ?? [], items: itemAllocations.data ?? [] },
        payment: { cobranca: document.data.cobranca, pagamentos: document.data.pagamentos },
      };
      await supabaseAdmin.from("totvs_integration_runs").update({ request_payload: payload }).eq("id", runId);

      this.sqlServer.assertWritesEnabled(scope.connectionKey);
      throw new Error("Escrita bloqueada: o SQL homologado de inclusão de movimento do seu TOTVS RM ainda não foi fornecido.");
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "Falha não identificada na integração TOTVS.";
      await supabaseAdmin.from("totvs_integration_runs").update({
        status: "blocked",
        finished_at: new Date().toISOString(),
        error_message: errorText,
      }).eq("id", runId);
      throw error;
    }
  }
}

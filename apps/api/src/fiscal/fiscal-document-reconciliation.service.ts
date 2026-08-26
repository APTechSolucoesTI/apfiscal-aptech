import { Injectable } from "@nestjs/common";
import type { DistributionResult, NfeProvider, NfeProviderKind } from "@apfiscal/shared";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { importarNfeXml } from "@/legacy/lib/nfe-import.server";
import {
  isFullNfeDocument,
  nfeAccessKey,
  nfeDistributedKind,
  nfeDistributionMetadata,
  wouldDowngradeCompleteDocument,
} from "./fiscal-document-reconciliation";
import {
  MANIFESTATION_EVENT,
  manifestationAccepted,
  type ManifestationKind,
} from "./nfe-lifecycle";
import { TotvsScopeService } from "@/totvs/totvs-scope.service";
import { TotvsSqlServerService } from "@/totvs/totvs-sql-server.service";

type DistributedDocument = DistributionResult["documents"][number];

function batches<T>(values: T[], size = 50): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

type IntegrationDocument = {
  id: string;
  nsu: number;
  chave: string;
  status: "resumida" | "manifestacao_pendente" | "aguardando_xml_completo" | "completa" | "erro";
  xml_completo_path: string | null;
  tentativas_xml_completo: number;
  fiscal_document_id?: string | null;
};

export type ReconciliationError = { chave?: string; nsu?: number; mensagem: string };

export type ReconciliationCounters = {
  discovered: number;
  newDocuments: number;
  knownDocuments: number;
  summariesDownloaded: number;
  fullXmlDownloaded: number;
  eventsProcessed: number;
  notesImported: number;
  duplicates: number;
  waitingForFullXml: number;
  errors: ReconciliationError[];
};

function reconciliationBatchSize(): number {
  const configured = Number(process.env.NFE_RECONCILIATION_BATCH_SIZE ?? 10);
  // Each pending summary can result in another SEFAZ request. Keep the batch
  // deliberately small so reconciliation never turns into a request burst.
  return Number.isInteger(configured) ? Math.min(Math.max(configured, 1), 10) : 10;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Falha não identificada ao reconciliar a NF-e.";
}

@Injectable()
export class FiscalDocumentReconciliationService {
  constructor(
    private readonly sqlServer: TotvsSqlServerService,
    private readonly scopes: TotvsScopeService,
  ) {}

  private async reconcileTotvs(organizationId: string, companyId: string) {
    const scope = await this.scopes.company(organizationId, companyId);
    const documents = await supabaseAdmin
      .from("fiscal_documents")
      .select("id, chave_acesso")
      .eq("company_id", companyId)
      .eq("tipo", "nfe")
      .not("chave_acesso", "is", null)
      .limit(1000);
    if (documents.error) throw documents.error;
    const byKey = new Map(
      (documents.data ?? [])
        .filter((row) => /^\d{44}$/.test(row.chave_acesso ?? ""))
        .map((row) => [row.chave_acesso!, row]),
    );
    if (!byKey.size) return;

    type RmMovement = {
      IDMOV: number;
      CHAVEACESSONFE: string;
      CODTB1FLX: string | null;
      CODCCUSTO: string | null;
      VALORLIQUIDO: number;
    };
    const movements: RmMovement[] = [];
    for (const keyBatch of batches([...byKey.keys()], 100)) {
      const keys = keyBatch.map((key) => `'${key}'`).join(",");
      const filial = scope.codFilial ? ` AND CODFILIAL=${scope.codFilial}` : "";
      movements.push(
        ...(await this.sqlServer.queryReadOnly<RmMovement>(
          `SELECT mov.IDMOV,mov.CHAVEACESSONFE,mov.CODTB1FLX,
             COALESCE((SELECT TOP 1 rat.CODCCUSTO FROM dbo.TMOVRATCCU rat WHERE rat.CODCOLIGADA=mov.CODCOLIGADA AND rat.IDMOV=mov.IDMOV ORDER BY rat.IDMOVRATCCU),mov.CODCCUSTO) AS CODCCUSTO,
             mov.VALORLIQUIDO
           FROM dbo.TMOV mov WHERE mov.CODCOLIGADA=${scope.codColigada}${filial} AND mov.CHAVEACESSONFE IN (${keys})`,
          {},
          scope.connectionKey,
        )),
      );
    }
    if (!movements.length) return;

    type RmRate = { IDMOV: number; CODCCUSTO: string; VALOR: number };
    const movementIds = movements.map((row) => row.IDMOV).join(",");
    const headerRates = await this.sqlServer.queryReadOnly<RmRate>(
      `SELECT IDMOV,CODCCUSTO,VALOR FROM dbo.TMOVRATCCU WHERE CODCOLIGADA=${scope.codColigada} AND IDMOV IN (${movementIds})`,
      {},
      scope.connectionKey,
    );
    type RmItem = { IDMOV: number; NSEQITMMOV: number; CODTB1FLX: string | null };
    type RmItemRate = RmRate & { NSEQITMMOV: number };
    const [rmItems, rmItemRates] = await Promise.all([
      this.sqlServer.queryReadOnly<RmItem>(
        `SELECT IDMOV,NSEQITMMOV,CODTB1FLX FROM dbo.TITMMOV WHERE CODCOLIGADA=${scope.codColigada} AND IDMOV IN (${movementIds})`,
        {},
        scope.connectionKey,
      ),
      this.sqlServer.queryReadOnly<RmItemRate>(
        `SELECT IDMOV,NSEQITMMOV,CODCCUSTO,VALOR FROM dbo.TITMMOVRATCCU WHERE CODCOLIGADA=${scope.codColigada} AND IDMOV IN (${movementIds})`,
        {},
        scope.connectionKey,
      ),
    ]);

    const planCodes = [
      ...new Set(
        [...movements.map((row) => row.CODTB1FLX), ...rmItems.map((row) => row.CODTB1FLX)].filter(
          Boolean,
        ),
      ),
    ] as string[];
    const costCenterCodes = [
      ...new Set(
        [
          ...movements.map((row) => row.CODCCUSTO),
          ...headerRates.map((row) => row.CODCCUSTO),
          ...rmItemRates.map((row) => row.CODCCUSTO),
        ].filter(Boolean),
      ),
    ] as string[];
    const documentIds = movements
      .map((movement) => byKey.get(movement.CHAVEACESSONFE)?.id)
      .filter(Boolean) as string[];
    const [plans, costCenters, localItems] = await Promise.all([
      planCodes.length
        ? supabaseAdmin
            .from("plano_contas")
            .select("id, codigo")
            .eq("organization_id", organizationId)
            .in("codigo", planCodes)
        : Promise.resolve({ data: [], error: null }),
      costCenterCodes.length
        ? supabaseAdmin
            .from("centros_custo")
            .select("id, codigo")
            .eq("organization_id", organizationId)
            .in("codigo", costCenterCodes)
        : Promise.resolve({ data: [], error: null }),
      supabaseAdmin
        .from("fiscal_document_items")
        .select("id, document_id, numero_item")
        .in("document_id", documentIds),
    ]);
    if (plans.error) throw plans.error;
    if (costCenters.error) throw costCenters.error;
    if (localItems.error) throw localItems.error;
    const planByCode = new Map((plans.data ?? []).map((row) => [row.codigo, row.id] as const));
    const costCenterByCode = new Map(
      (costCenters.data ?? []).map((row) => [row.codigo, row.id] as const),
    );
    const now = new Date().toISOString();

    for (const movement of movements) {
      const document = byKey.get(movement.CHAVEACESSONFE);
      if (!document) continue;
      const updated = await supabaseAdmin
        .from("fiscal_documents")
        .update({
          status: "integrado_totvs",
          status_observacao: `Reconciliado com o movimento TOTVS RM ${movement.IDMOV}.`,
          status_updated_at: now,
          plano_contas_id: movement.CODTB1FLX ? (planByCode.get(movement.CODTB1FLX) ?? null) : null,
        })
        .eq("id", document.id);
      if (updated.error) throw updated.error;
      const actualRates = headerRates.filter((rate) => rate.IDMOV === movement.IDMOV);
      if (actualRates.length) {
        const removed = await supabaseAdmin
          .from("nfe_centro_custo")
          .delete()
          .eq("document_id", document.id);
        if (removed.error) throw removed.error;
        const inserted = await supabaseAdmin.from("nfe_centro_custo").insert(
          actualRates.flatMap((rate) => {
            const costCenterId = costCenterByCode.get(rate.CODCCUSTO);
            return costCenterId
              ? [{ document_id: document.id, centro_custo_id: costCenterId, valor: rate.VALOR }]
              : [];
          }),
        );
        if (inserted.error) throw inserted.error;
      }
      const documentItems = (localItems.data ?? []).filter(
        (item) => item.document_id === document.id,
      );
      for (const rmItem of rmItems.filter((item) => item.IDMOV === movement.IDMOV)) {
        const localItem = documentItems.find((item) => item.numero_item === rmItem.NSEQITMMOV);
        if (!localItem) continue;
        const itemUpdated = await supabaseAdmin
          .from("fiscal_document_items")
          .update({
            plano_contas_id: rmItem.CODTB1FLX ? (planByCode.get(rmItem.CODTB1FLX) ?? null) : null,
          })
          .eq("id", localItem.id);
        if (itemUpdated.error) throw itemUpdated.error;
        const actualItemRates = rmItemRates.filter(
          (rate) => rate.IDMOV === movement.IDMOV && rate.NSEQITMMOV === rmItem.NSEQITMMOV,
        );
        if (!actualItemRates.length) continue;
        const removed = await supabaseAdmin
          .from("nfe_item_centro_custo")
          .delete()
          .eq("document_item_id", localItem.id);
        if (removed.error) throw removed.error;
        const inserted = await supabaseAdmin.from("nfe_item_centro_custo").insert(
          actualItemRates.flatMap((rate) => {
            const costCenterId = costCenterByCode.get(rate.CODCCUSTO);
            return costCenterId
              ? [
                  {
                    document_item_id: localItem.id,
                    centro_custo_id: costCenterId,
                    valor: rate.VALOR,
                  },
                ]
              : [];
          }),
        );
        if (inserted.error) throw inserted.error;
      }
    }
  }

  async backfillMetadata(companyId: string, limit = 1000) {
    const stored = await supabaseAdmin
      .from("documentos_fiscais_integracao")
      .select("id, chave, tipo_documento, xml_resumido_path, xml_completo_path")
      .eq("company_id", companyId)
      .or("emitente_nome.is.null,fiscal_document_id.is.null")
      .order("nsu", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 1000));
    if (stored.error) throw stored.error;
    let updated = 0;
    const errors: string[] = [];
    for (const row of stored.data ?? []) {
      const path = row.xml_completo_path ?? row.xml_resumido_path;
      if (!path) continue;
      try {
        const downloaded = await supabaseAdmin.storage.from("fiscal-xml").download(path);
        if (downloaded.error) throw downloaded.error;
        const xml = await downloaded.data.text();
        const metadata = nfeDistributionMetadata({ schema: row.tipo_documento ?? "unknown", xml });
        const canonical = await supabaseAdmin
          .from("fiscal_documents")
          .select("id")
          .eq("company_id", companyId)
          .eq("chave_acesso", row.chave)
          .maybeSingle();
        if (canonical.error) throw canonical.error;
        const result = await supabaseAdmin
          .from("documentos_fiscais_integracao")
          .update({
            fiscal_document_id: canonical.data?.id ?? null,
            tipo_documento: metadata.documentType,
            schema_documento: metadata.schema,
            numero: metadata.number,
            serie: metadata.series,
            emitente_cnpj: metadata.issuerTaxId,
            emitente_nome: metadata.issuerName,
            emitente_ie: metadata.issuerStateRegistration,
            data_emissao: metadata.issuedAt,
            valor_nota: metadata.total,
            protocolo: metadata.protocol,
            situacao: metadata.situation,
            tipo_evento: metadata.eventType,
            data_recebimento: metadata.receivedAt,
            ...(row.xml_completo_path ? { status: "completa" as const } : {}),
            status_download: row.xml_completo_path ? "completo_disponivel" : "resumo_disponivel",
          })
          .eq("id", row.id);
        if (result.error) throw result.error;
        updated += 1;
      } catch (error) {
        errors.push(`${row.chave}: ${errorMessage(error)}`);
      }
    }
    return { located: stored.data?.length ?? 0, updated, errors };
  }

  private async existingIntegrationDocuments(companyId: string, keys: string[]) {
    if (keys.length === 0) return new Map<string, IntegrationDocument>();
    const rows: IntegrationDocument[] = [];
    for (const keyBatch of batches(keys)) {
      const result = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .select("id, nsu, chave, status, xml_completo_path, tentativas_xml_completo")
        .eq("company_id", companyId)
        .in("chave", keyBatch);
      if (result.error) throw result.error;
      rows.push(...(result.data as IntegrationDocument[]));
    }
    return new Map(rows.map((row) => [row.chave, row]));
  }

  private async canonicalKeys(companyId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const found = new Set<string>();
    for (const keyBatch of batches(keys)) {
      const result = await supabaseAdmin
        .from("fiscal_documents")
        .select("chave_acesso")
        .eq("company_id", companyId)
        .in("chave_acesso", keyBatch);
      if (result.error) throw result.error;
      for (const row of result.data ?? []) found.add(String(row.chave_acesso));
    }
    return found;
  }

  private async importFullXml(input: {
    companyId: string;
    providerKind: NfeProviderKind;
    key: string;
    path: string;
    xml: string;
    counters: ReconciliationCounters;
  }) {
    const imported = await importarNfeXml(supabaseAdmin, { fileName: input.path, xml: input.xml });
    if (imported.ok) input.counters.notesImported += 1;
    if (imported.duplicated) input.counters.duplicates += 1;
    if (imported.documentId) {
      const update = await supabaseAdmin
        .from("fiscal_documents")
        .update({ source_provider: input.providerKind })
        .eq("id", imported.documentId)
        .is("source_provider", null);
      if (update.error) throw update.error;
      const linked = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .update({
          fiscal_document_id: imported.documentId,
          status_download: "completo_disponivel",
          ultima_sincronizacao: new Date().toISOString(),
        })
        .eq("company_id", input.companyId)
        .eq("chave", input.key);
      if (linked.error) throw linked.error;
      const linkedEvents = await supabaseAdmin
        .from("manifestations")
        .update({ fiscal_document_id: imported.documentId })
        .eq("company_id", input.companyId)
        .eq("access_key", input.key);
      if (linkedEvents.error) throw linkedEvents.error;
    }
    const promoted = await supabaseAdmin
      .from("documentos_fiscais_integracao")
      .update({
        status: "completa",
        mensagem_sefaz: null,
      })
      .eq("company_id", input.companyId)
      .eq("chave", input.key);
    if (promoted.error) throw promoted.error;
  }

  private async persistDistributedDocument(input: {
    organizationId: string;
    companyId: string;
    providerKind: NfeProviderKind;
    document: DistributedDocument;
    counters: ReconciliationCounters;
  }): Promise<string | null> {
    const key = nfeAccessKey(input.document.xml);
    if (!key) {
      input.counters.errors.push({
        nsu: Number(input.document.nsu),
        mensagem: "Documento sem chave de acesso válida.",
      });
      return null;
    }
    const metadata = nfeDistributionMetadata(input.document);
    const full = metadata.full;
    const normalizedNsu = String(input.document.nsu).replace(/^0+(?=\d)/, "");
    const path = `${input.companyId}/${normalizedNsu}-${full ? "completa" : "resumida"}-${key}.xml`;
    try {
      const current = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .select("id, xml_completo_path")
        .eq("company_id", input.companyId)
        .eq("chave", key)
        .maybeSingle();
      if (current.error) throw current.error;
      // Uma reentrega de resNFe nunca pode rebaixar uma NF-e que já foi
      // promovida para completa.
      if (
        wouldDowngradeCompleteDocument({
          incomingKind: nfeDistributedKind(input.document),
          currentFullXmlPath: current.data?.xml_completo_path,
        })
      )
        return key;
      const upload = await supabaseAdmin.storage
        .from("fiscal-xml")
        .upload(path, Buffer.from(input.document.xml), {
          contentType: "application/xml",
          upsert: true,
        });
      if (upload.error) throw upload.error;
      const upsert = await supabaseAdmin.from("documentos_fiscais_integracao").upsert(
        {
          organization_id: input.organizationId,
          company_id: input.companyId,
          nsu: Number(input.document.nsu),
          chave: key,
          tipo_documento: metadata.documentType,
          schema_documento: metadata.schema,
          numero: metadata.number,
          serie: metadata.series,
          emitente_cnpj: metadata.issuerTaxId,
          emitente_nome: metadata.issuerName,
          emitente_ie: metadata.issuerStateRegistration,
          data_emissao: metadata.issuedAt,
          valor_nota: metadata.total,
          protocolo: metadata.protocol,
          situacao: metadata.situation,
          tipo_evento: metadata.eventType,
          data_recebimento: metadata.receivedAt ?? new Date().toISOString(),
          status: full ? "completa" : "resumida",
          status_download: full ? "completo_disponivel" : "resumo_disponivel",
          ultima_sincronizacao: new Date().toISOString(),
          mensagem_sefaz: null,
          ...(full ? { xml_completo_path: path } : { xml_resumido_path: path }),
        },
        { onConflict: "company_id,chave" },
      );
      if (upsert.error) throw upsert.error;
      if (full) {
        input.counters.fullXmlDownloaded += 1;
        await this.importFullXml({ ...input, key, path, xml: input.document.xml });
      } else {
        input.counters.summariesDownloaded += 1;
      }
      return key;
    } catch (error) {
      input.counters.errors.push({
        chave: key,
        nsu: Number(input.document.nsu),
        mensagem: errorMessage(error),
      });
      const failed = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .update({ status: "erro", mensagem_sefaz: errorMessage(error) })
        .eq("company_id", input.companyId)
        .eq("chave", key);
      if (failed.error) input.counters.errors.push({ chave: key, mensagem: failed.error.message });
      return key;
    }
  }

  private async persistDistributedEvent(input: {
    organizationId: string;
    companyId: string;
    providerKind: NfeProviderKind;
    document: DistributedDocument;
    counters: ReconciliationCounters;
  }) {
    const metadata = nfeDistributionMetadata(input.document);
    const key = metadata.key;
    if (!key || !metadata.eventType) return;
    const kind = (Object.entries(MANIFESTATION_EVENT).find(
      ([, event]) => event.code === metadata.eventType,
    )?.[0] ?? null) as ManifestationKind | null;
    if (!kind) return;
    const normalizedNsu = String(input.document.nsu).replace(/^0+(?=\d)/, "");
    const path = `${input.companyId}/events/${normalizedNsu}-${metadata.eventType}-${key}.xml`;
    const upload = await supabaseAdmin.storage
      .from("fiscal-xml")
      .upload(path, Buffer.from(input.document.xml), {
        contentType: "application/xml",
        upsert: true,
      });
    if (upload.error) throw upload.error;

    let summary = await supabaseAdmin
      .from("documentos_fiscais_integracao")
      .select("id, fiscal_document_id, xml_completo_path")
      .eq("company_id", input.companyId)
      .eq("chave", key)
      .maybeSingle();
    if (summary.error) throw summary.error;
    if (!summary.data) {
      const created = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .insert({
          organization_id: input.organizationId,
          company_id: input.companyId,
          nsu: Number(input.document.nsu),
          chave: key,
          tipo_documento: "Evento",
          schema_documento: "event-only",
          status: "resumida",
          status_download: "pendente",
          ultima_sincronizacao: new Date().toISOString(),
        })
        .select("id, fiscal_document_id, xml_completo_path")
        .single();
      if (created.error) throw created.error;
      summary = created;
    }
    if (!summary.data) throw new Error("Não foi possível vincular o evento ao resumo da NF-e.");
    const summaryRow = summary.data;
    const accepted = manifestationAccepted(metadata.situation) || Boolean(metadata.protocol);
    const existing = await supabaseAdmin
      .from("manifestations")
      .select("id, source")
      .eq("company_id", input.companyId)
      .eq("access_key", key)
      .eq("tipo", kind)
      .eq("sequence", metadata.eventSequence)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const eventData = {
      organization_id: input.organizationId,
      company_id: input.companyId,
      integration_document_id: summaryRow.id,
      fiscal_document_id: summaryRow.fiscal_document_id,
      access_key: key,
      tipo: kind,
      tp_evento: metadata.eventType,
      descricao_evento: metadata.eventDescription ?? MANIFESTATION_EVENT[kind].description,
      sequence: metadata.eventSequence,
      provider: input.providerKind,
      source: existing.data?.source ?? "distribution",
      status: accepted ? "accepted" : "rejected",
      requested_at: metadata.eventAt ?? metadata.receivedAt ?? new Date().toISOString(),
      response_cstat: metadata.situation,
      response_xmotivo: metadata.eventReason,
      response_payload: { xml_path: path },
      protocolo: metadata.protocol,
      event_at: metadata.eventAt ?? metadata.receivedAt,
    };
    const persisted = existing.data
      ? await supabaseAdmin.from("manifestations").update(eventData).eq("id", existing.data.id)
      : await supabaseAdmin.from("manifestations").insert(eventData);
    if (persisted.error) throw persisted.error;
    if (!summaryRow.xml_completo_path) {
      const status =
        accepted && ["ciencia", "confirmacao"].includes(kind)
          ? "aguardando_xml_completo"
          : "resumida";
      const updated = await supabaseAdmin
        .from("documentos_fiscais_integracao")
        .update({
          status,
          status_manifestacao: accepted ? kind : null,
          protocolo: metadata.protocol,
          mensagem_sefaz: accepted ? null : metadata.eventReason,
          ultima_sincronizacao: new Date().toISOString(),
        })
        .eq("id", summaryRow.id)
        .is("xml_completo_path", null);
      if (updated.error) throw updated.error;
    }
    input.counters.eventsProcessed += 1;
  }

  private async backfillStoredFullXml(input: {
    companyId: string;
    providerKind: NfeProviderKind;
    counters: ReconciliationCounters;
  }) {
    const stored = await supabaseAdmin
      .from("documentos_fiscais_integracao")
      .select("id, nsu, chave, status, xml_completo_path, tentativas_xml_completo")
      .eq("company_id", input.companyId)
      .not("xml_completo_path", "is", null)
      .order("nsu", { ascending: true })
      .limit(1000);
    if (stored.error) throw stored.error;
    const rows = stored.data as IntegrationDocument[];
    const canonical = await this.canonicalKeys(
      input.companyId,
      rows.map((row) => row.chave),
    );
    for (const row of rows) {
      if (!row.xml_completo_path) continue;
      if (canonical.has(row.chave)) {
        const repaired = await supabaseAdmin
          .from("documentos_fiscais_integracao")
          .update({
            status: "completa",
            status_download: "completo_disponivel",
            mensagem_sefaz: null,
            ultima_sincronizacao: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (repaired.error) throw repaired.error;
        continue;
      }
      try {
        const downloaded = await supabaseAdmin.storage
          .from("fiscal-xml")
          .download(row.xml_completo_path);
        if (downloaded.error) throw downloaded.error;
        const xml = await downloaded.data.text();
        if (!isFullNfeDocument({ schema: "procNFe", xml }))
          throw new Error("O arquivo armazenado não contém uma NF-e completa.");
        await this.importFullXml({
          companyId: input.companyId,
          providerKind: input.providerKind,
          key: row.chave,
          path: row.xml_completo_path,
          xml,
          counters: input.counters,
        });
      } catch (error) {
        input.counters.errors.push({
          chave: row.chave,
          nsu: row.nsu,
          mensagem: errorMessage(error),
        });
      }
    }
  }

  private async promoteKnownSummaries(input: {
    organizationId: string;
    companyId: string;
    providerKind: NfeProviderKind;
    provider: NfeProvider;
    counters: ReconciliationCounters;
  }) {
    const pending = await supabaseAdmin
      .from("documentos_fiscais_integracao")
      .select("id, nsu, chave, status, xml_completo_path, tentativas_xml_completo")
      .eq("company_id", input.companyId)
      .is("xml_completo_path", null)
      .in("status", ["resumida", "manifestacao_pendente", "aguardando_xml_completo", "erro"])
      .order("tentativas_xml_completo", { ascending: true })
      .order("nsu", { ascending: true })
      .limit(reconciliationBatchSize());
    if (pending.error) throw pending.error;

    for (const row of pending.data as IntegrationDocument[]) {
      try {
        const xml = await input.provider.fetchFullXml(input.companyId, row.chave);
        const fullDocument: DistributedDocument = { nsu: String(row.nsu), schema: "procNFe", xml };
        if (!isFullNfeDocument(fullDocument))
          throw new Error("XML completo ainda não foi liberado pela SEFAZ.");
        await this.persistDistributedDocument({ ...input, document: fullDocument });
      } catch (error) {
        input.counters.waitingForFullXml += 1;
        const update = await supabaseAdmin
          .from("documentos_fiscais_integracao")
          .update({
            status: "aguardando_xml_completo",
            tentativas_xml_completo: row.tentativas_xml_completo + 1,
            mensagem_sefaz: errorMessage(error),
          })
          .eq("id", row.id);
        if (update.error)
          input.counters.errors.push({
            chave: row.chave,
            nsu: row.nsu,
            mensagem: update.error.message,
          });
      }
    }
  }

  async reconcile(input: {
    organizationId: string;
    companyId: string;
    providerKind: NfeProviderKind;
    provider: NfeProvider;
    incoming: DistributedDocument[];
  }): Promise<ReconciliationCounters> {
    const uniqueIncoming = new Map<string, DistributedDocument>();
    const counters: ReconciliationCounters = {
      discovered: input.incoming.length,
      newDocuments: 0,
      knownDocuments: 0,
      summariesDownloaded: 0,
      fullXmlDownloaded: 0,
      eventsProcessed: 0,
      notesImported: 0,
      duplicates: 0,
      waitingForFullXml: 0,
      errors: [],
    };
    const events: DistributedDocument[] = [];
    for (const document of input.incoming) {
      const key = nfeAccessKey(document.xml);
      if (!key) {
        counters.errors.push({
          nsu: Number(document.nsu),
          mensagem: "Documento descoberto sem chave de acesso válida.",
        });
        continue;
      }
      if (nfeDistributedKind(document) === "event") {
        events.push(document);
        continue;
      }
      const current = uniqueIncoming.get(key);
      if (!current || (!isFullNfeDocument(current) && isFullNfeDocument(document)))
        uniqueIncoming.set(key, document);
    }
    const existing = await this.existingIntegrationDocuments(input.companyId, [
      ...uniqueIncoming.keys(),
    ]);
    counters.newDocuments = [...uniqueIncoming.keys()].filter((key) => !existing.has(key)).length;
    counters.knownDocuments = uniqueIncoming.size - counters.newDocuments;

    for (const event of events) {
      try {
        await this.persistDistributedEvent({ ...input, document: event, counters });
      } catch (error) {
        counters.errors.push({
          chave: nfeAccessKey(event.xml) ?? undefined,
          nsu: Number(event.nsu),
          mensagem: errorMessage(error),
        });
      }
    }

    for (const document of uniqueIncoming.values()) {
      await this.persistDistributedDocument({ ...input, document, counters });
    }
    await this.backfillMetadata(input.companyId, 50);
    await this.backfillStoredFullXml({ ...input, counters });
    await this.promoteKnownSummaries({ ...input, counters });
    try {
      await this.reconcileTotvs(input.organizationId, input.companyId);
    } catch (error) {
      counters.errors.push({ mensagem: `Reconciliação TOTVS: ${errorMessage(error)}` });
    }
    return counters;
  }
}

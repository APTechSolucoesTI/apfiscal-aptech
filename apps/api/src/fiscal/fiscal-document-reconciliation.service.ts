import { Injectable } from "@nestjs/common";
import type { DistributionResult, NfeProvider, NfeProviderKind } from "@apfiscal/shared";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { importarNfeXml } from "@/legacy/lib/nfe-import.server";
import {
  isFullNfeDocument,
  nfeAccessKey,
  nfeDistributionMetadata,
} from "./fiscal-document-reconciliation";

type DistributedDocument = DistributionResult["documents"][number];

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
    const result = await supabaseAdmin
      .from("documentos_fiscais_integracao")
      .select("id, nsu, chave, status, xml_completo_path, tentativas_xml_completo")
      .eq("company_id", companyId)
      .in("chave", keys);
    if (result.error) throw result.error;
    return new Map((result.data as IntegrationDocument[]).map((row) => [row.chave, row]));
  }

  private async canonicalKeys(companyId: string, keys: string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const result = await supabaseAdmin
      .from("fiscal_documents")
      .select("chave_acesso")
      .eq("company_id", companyId)
      .in("chave_acesso", keys);
    if (result.error) throw result.error;
    return new Set((result.data ?? []).map((row) => String(row.chave_acesso)));
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
      if (canonical.has(row.chave) || !row.xml_completo_path) continue;
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
      notesImported: 0,
      duplicates: 0,
      waitingForFullXml: 0,
      errors: [],
    };
    for (const document of input.incoming) {
      const key = nfeAccessKey(document.xml);
      if (!key) {
        counters.errors.push({
          nsu: Number(document.nsu),
          mensagem: "Documento descoberto sem chave de acesso válida.",
        });
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

    for (const document of uniqueIncoming.values()) {
      await this.persistDistributedDocument({ ...input, document, counters });
    }
    await this.backfillMetadata(input.companyId, 50);
    await this.backfillStoredFullXml({ ...input, counters });
    await this.promoteKnownSummaries({ ...input, counters });
    return counters;
  }
}

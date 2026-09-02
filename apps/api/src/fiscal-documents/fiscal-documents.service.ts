import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { RbacService } from "@/common/rbac.service";
import {
  isApprovedNfseStatus,
  parseNfseXml,
  type CanonicalNfse,
} from "@/nfse/nfse-document-parser";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function nfseFields(parsed: CanonicalNfse, xml: string, xmlPath: string, source: string) {
  const now = new Date().toISOString();
  return {
    tipo: "nfse",
    chave_acesso: parsed.accessKey,
    numero: parsed.number,
    serie: parsed.series,
    emitente_cnpj: parsed.issuerTaxId,
    emitente_nome: parsed.issuerName,
    destinatario_cnpj: parsed.recipientTaxId,
    destinatario_nome: parsed.recipientName,
    valor_total: parsed.total,
    valor_impostos: parsed.taxTotal,
    situacao: parsed.status,
    natureza_operacao: parsed.serviceDescription,
    data_emissao: parsed.issuedAt,
    external_id: parsed.externalId,
    verification_code: parsed.verificationCode,
    competence_date: parsed.competenceDate,
    service_municipality_code: parsed.serviceMunicipalityCode,
    service_municipality_name: parsed.serviceMunicipalityName,
    incidence_municipality_code: parsed.incidenceMunicipalityCode,
    incidence_municipality_name: parsed.incidenceMunicipalityName,
    service_gross_value: parsed.grossValue,
    service_net_value: parsed.netValue,
    deductions_value: parsed.deductionsValue,
    unconditional_discount_value: parsed.unconditionalDiscountValue,
    conditional_discount_value: parsed.conditionalDiscountValue,
    retentions_value: parsed.retentionsValue,
    iss_base_value: parsed.issBaseValue,
    iss_rate: parsed.issRate,
    iss_value: parsed.issValue,
    service_code_national: parsed.serviceCodeNational,
    service_code_municipal: parsed.serviceCodeMunicipal,
    cnae_code: parsed.cnaeCode,
    service_description: parsed.serviceDescription,
    tax_regime: parsed.taxRegime,
    special_tax_regime: parsed.specialTaxRegime,
    nfse_details: parsed.details,
    sync_status: isApprovedNfseStatus(parsed.status) ? "processed" : "cancelled",
    last_sync_attempt_at: now,
    last_sync_success_at: now,
    processing_error: null,
    xml_path: xmlPath,
    xml_content: xml,
    source_provider: source,
  };
}

@Injectable()
export class FiscalDocumentsService {
  constructor(private readonly rbac: RbacService) {}

  assertCompanyAccess(userId: string, companyId: string) {
    return this.rbac.assertCompanyAccess(userId, companyId);
  }

  private async organizationId(userId: string) {
    const membership = await supabaseAdmin
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) throw new NotFoundException("Organização ativa não encontrada.");
    return membership.data.organization_id;
  }

  private async companyIds(userId: string) {
    const organizationId = await this.organizationId(userId);
    const [companies, access] = await Promise.all([
      supabaseAdmin.from("companies").select("id").eq("organization_id", organizationId),
      supabaseAdmin.from("company_access").select("company_id").eq("user_id", userId),
    ]);
    if (companies.error) throw companies.error;
    if (access.error) throw access.error;
    const restricted = new Set((access.data ?? []).map((row) => row.company_id));
    const ids = (companies.data ?? [])
      .map((row) => row.id)
      .filter((id) => restricted.size === 0 || restricted.has(id));
    return { organizationId, ids };
  }

  async listNfse(userId: string) {
    const { ids } = await this.companyIds(userId);
    if (!ids.length) return [];
    const documents = await supabaseAdmin
      .from("fiscal_documents")
      .select(
        "id, company_id, numero, serie, chave_acesso, emitente_cnpj, emitente_nome, destinatario_cnpj, destinatario_nome, valor_total, valor_impostos, situacao, status, data_emissao, competence_date, service_municipality_name, service_gross_value, service_net_value, retentions_value, iss_value, sync_status, xml_path, source_provider, last_sync_success_at, processing_error, companies(razao_social, nome_fantasia, cnpj)",
      )
      .eq("tipo", "nfse")
      .in("company_id", ids)
      .order("data_emissao", { ascending: false })
      .limit(5000);
    if (documents.error) throw documents.error;
    const documentIds = (documents.data ?? []).map((document) => document.id);
    const runs = documentIds.length
      ? await supabaseAdmin
          .from("totvs_integration_runs")
          .select("fiscal_document_id, status, rm_record_id, error_message, attempt, created_at")
          .in("fiscal_document_id", documentIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (runs.error) throw runs.error;
    const latest = new Map<string, (typeof runs.data)[number]>();
    for (const run of runs.data ?? [])
      if (!latest.has(run.fiscal_document_id)) latest.set(run.fiscal_document_id, run);
    return (documents.data ?? []).map((document) => ({
      ...document,
      xml_available: Boolean(document.xml_path),
      totvs: latest.get(document.id) ?? null,
    }));
  }

  async nfseDetails(userId: string, id: string) {
    const document = await supabaseAdmin
      .from("fiscal_documents")
      .select("*, companies(id, organization_id, razao_social, nome_fantasia, cnpj)")
      .eq("id", id)
      .eq("tipo", "nfse")
      .maybeSingle();
    if (document.error) throw document.error;
    if (!document.data) throw new NotFoundException("NFS-e não encontrada.");
    await this.rbac.assertCompanyAccess(userId, document.data.company_id);
    const [history, runs, distribution] = await Promise.all([
      supabaseAdmin
        .from("fiscal_document_history")
        .select("id, event_type, status, message, payload, occurred_at")
        .eq("fiscal_document_id", id)
        .order("occurred_at", { ascending: false }),
      supabaseAdmin
        .from("totvs_integration_runs")
        .select(
          "id, status, attempt, rm_record_id, error_message, started_at, finished_at, created_at",
        )
        .eq("fiscal_document_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("nfse_distribution_documents")
        .select("provider, nsu, content_type, received_at")
        .eq("company_id", document.data.company_id)
        .eq("access_key", document.data.chave_acesso)
        .maybeSingle(),
    ]);
    if (history.error) throw history.error;
    if (runs.error) throw runs.error;
    if (distribution.error) throw distribution.error;
    return {
      document: document.data,
      history: history.data ?? [],
      runs: runs.data ?? [],
      distribution: distribution.data ?? null,
    };
  }

  async xml(userId: string, id: string) {
    const document = await supabaseAdmin
      .from("fiscal_documents")
      .select("id, company_id, chave_acesso, numero, xml_content, companies(organization_id)")
      .eq("id", id)
      .maybeSingle();
    if (document.error) throw document.error;
    if (!document.data) throw new NotFoundException("Documento fiscal não encontrado.");
    await this.rbac.assertCompanyAccess(userId, document.data.company_id);
    if (!document.data.xml_content)
      throw new NotFoundException("XML não disponível para este documento.");
    const company = document.data.companies as unknown as { organization_id: string };
    await supabaseAdmin.from("fiscal_document_history").insert({
      organization_id: company.organization_id,
      company_id: document.data.company_id,
      fiscal_document_id: id,
      event_type: "xml_downloaded",
      status: "success",
      message: "XML baixado pelo usuário.",
      created_by: userId,
    });
    return {
      filename: `${document.data.chave_acesso || document.data.numero || id}.xml`,
      xml: document.data.xml_content,
    };
  }

  async importNfse(userId: string, fileName: string, xml: string) {
    const parsed = parseNfseXml(xml);
    if (!parsed.recipientTaxId) throw new NotFoundException("XML sem CPF/CNPJ do tomador.");
    const { organizationId } = await this.companyIds(userId);
    const companies = await supabaseAdmin
      .from("companies")
      .select("id, cnpj, razao_social, nome_fantasia")
      .eq("organization_id", organizationId);
    if (companies.error) throw companies.error;
    const company = (companies.data ?? []).find(
      (item) => digits(item.cnpj) === digits(parsed.recipientTaxId!),
    );
    if (!company)
      throw new NotFoundException("Nenhuma empresa acessível corresponde ao tomador deste XML.");
    await this.rbac.assertCompanyAccess(userId, company.id);
    const existing = await supabaseAdmin
      .from("fiscal_documents")
      .select("id")
      .eq("company_id", company.id)
      .eq("chave_acesso", parsed.accessKey)
      .maybeSingle();
    if (existing.error) throw existing.error;
    const hash = createHash("sha256").update(xml).digest("hex");
    const xmlPath = `${company.id}/nfse/manual-${hash.slice(0, 12)}-${parsed.accessKey}.xml`;
    const uploaded = await supabaseAdmin.storage
      .from("fiscal-xml")
      .upload(xmlPath, Buffer.from(xml), {
        contentType: "application/xml",
        upsert: true,
      });
    if (uploaded.error) throw uploaded.error;
    const saved = await supabaseAdmin
      .from("fiscal_documents")
      .upsert(
        { company_id: company.id, ...nfseFields(parsed, xml, xmlPath, "manual") },
        { onConflict: "chave_acesso" },
      )
      .select("id")
      .single();
    if (saved.error) throw saved.error;
    const history = await supabaseAdmin.from("fiscal_document_history").insert({
      organization_id: organizationId,
      company_id: company.id,
      fiscal_document_id: saved.data.id,
      event_type: existing.data ? "reprocessed" : "imported",
      status: "success",
      message: `${fileName} ${existing.data ? "reprocessado" : "importado"} manualmente.`,
      payload: { source: "manual", sha256: hash },
      created_by: userId,
    });
    if (history.error) throw history.error;
    return {
      id: saved.data.id,
      duplicated: Boolean(existing.data),
      companyName: company.nome_fantasia || company.razao_social,
    };
  }
}

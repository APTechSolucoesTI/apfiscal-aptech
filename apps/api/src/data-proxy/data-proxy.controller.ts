import { All, Controller, ForbiddenException, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import type { AuthenticatedRequest } from "@/common/request-user";
import { RbacService } from "@/common/rbac.service";
import { env } from "@/config/env";

const tablePermissions: Record<string, { read: string; write: string }> = {
  companies: { read: "companies.view", write: "companies.manage" },
  suppliers: { read: "suppliers.view", write: "suppliers.manage" },
  products: { read: "products.view", write: "products.manage" },
  produtos: { read: "products.view", write: "products.manage" },
  produtos_fornecedores: { read: "products.view", write: "products.manage" },
  familias: { read: "classifications.view", write: "classifications.manage" },
  grupos: { read: "classifications.view", write: "classifications.manage" },
  subgrupos: { read: "classifications.view", write: "classifications.manage" },
  fiscal_documents: { read: "documents.nfe.view", write: "documents.nfe.manage" },
  fiscal_document_items: { read: "documents.nfe.view", write: "documents.nfe.manage" },
  notifications: { read: "notifications.view", write: "notifications.manage" },
  notification_settings: { read: "notifications.view", write: "notifications.manage" },
  api_keys: { read: "settings.api_keys.view", write: "settings.api_keys.manage" },
  centros_custo: { read: "finance.cost_centers.view", write: "finance.cost_centers.manage" },
  plano_contas: { read: "finance.chart_accounts.view", write: "finance.chart_accounts.manage" },
  locais_estoque: { read: "finance.stock_locations.view", write: "finance.stock_locations.manage" },
  empresa_integracoes_fiscais: { read: "nfe.integration.view", write: "nfe.integration.manage" },
  documentos_fiscais_integracao: { read: "nfe.integration.view", write: "nfe.integration.manage" },
  historico_integracao_fiscal: { read: "nfe.integration.view", write: "nfe.integration.manage" },
};

@Controller("data-proxy")
export class DataProxyController {
  constructor(private readonly rbac: RbacService) {}

  @All()
  async proxy(
    @Query("target") target: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    if (!target?.startsWith("/rest/v1/") && !target?.startsWith("/storage/v1/")) {
      throw new ForbiddenException("Destino do proxy não permitido.");
    }
    const table = target.startsWith("/rest/v1/") ? target.slice("/rest/v1/".length).split(/[?/]/)[0] : "fiscal_documents";
    const mapping = tablePermissions[table];
    if (!mapping) throw new ForbiddenException("Recurso de domínio não permitido.");
    await this.rbac.assertPermission(request.user.id, request.method === "GET" || request.method === "HEAD" ? mapping.read : mapping.write);

    const headers = new Headers();
    for (const key of ["accept", "accept-profile", "content-profile", "content-type", "prefer", "range", "range-unit"]) {
      const value = request.headers[key];
      if (typeof value === "string") headers.set(key, value);
    }
    headers.set("apikey", env("SUPABASE_PUBLISHABLE_KEY"));
    headers.set("authorization", `Bearer ${request.accessToken}`);
    const upstream = await fetch(`${env("SUPABASE_URL")}${target}`, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : JSON.stringify(request.body),
    });
    response.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (["content-type", "content-range", "location", "preference-applied"].includes(key.toLowerCase())) response.setHeader(key, value);
    });
    response.send(Buffer.from(await upstream.arrayBuffer()));
  }
}

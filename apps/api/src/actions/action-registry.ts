import { isRegisteredAction, type RegisteredAction } from "@/common/action-builder";
import * as apfiscal from "@/legacy/lib/apfiscal.functions";
import * as costCenters from "@/legacy/lib/centros-custo.functions";
import * as classifications from "@/legacy/lib/classifications.functions";
import * as companies from "@/legacy/lib/companies.functions";
import * as fiscalDocuments from "@/legacy/lib/fiscal-documents.functions";
import * as stockLocations from "@/legacy/lib/locais-estoque.functions";
import * as allocations from "@/legacy/lib/nfe-alocacao.functions";
import * as importer from "@/legacy/lib/nfe-import.functions";
import * as status from "@/legacy/lib/nfe-status.functions";
import * as organization from "@/legacy/lib/organization.functions";
import * as chartAccounts from "@/legacy/lib/plano-contas.functions";
import * as products from "@/legacy/lib/products.functions";
import * as suppliers from "@/legacy/lib/suppliers.functions";
import * as purchaseTypes from "@/legacy/lib/tipos-compra.functions";
import * as movementTypes from "@/legacy/lib/tipos-movimento.functions";

const modules = [
  apfiscal,
  costCenters,
  classifications,
  companies,
  fiscalDocuments,
  stockLocations,
  allocations,
  importer,
  status,
  organization,
  chartAccounts,
  products,
  suppliers,
  purchaseTypes,
  movementTypes,
];

export const actionRegistry = Object.fromEntries(
  modules.flatMap((module) =>
    Object.entries(module)
      .filter((entry): entry is [string, RegisteredAction<unknown, unknown>] => isRegisteredAction(entry[1])),
  ),
);

const readActions = new Set([
  "getIntegracaoEmpresa", "getNfeDetails", "getAlocacaoNfe", "getOrgSettings",
  "listCentrosCusto", "listClassifications", "listLocaisEstoque", "listPlanoContas",
  "listProducts", "getProduct", "getNextProductCode", "listProductSuppliers",
  "getNfeItemLinkContext", "searchProductsForLink", "listStatusHistorico", "listSuppliers",
  "listSupplierFiscalDocuments",
  "listTiposCompra", "fetchCompanyByCnpj", "fetchAddressByCep", "baixarXmlDocumento",
  "listTiposMovimento",
]);

const specialPermissions: Record<string, string> = {
  aprovarNfe: "documents.nfe.approve",
  linkNfeItemToProduct: "documents.nfe.link_products",
  unlinkNfeItem: "documents.nfe.link_products",
  createProductAndLinkItem: "documents.nfe.link_products",
  sincronizarNfes: "nfe.integration.manage",
  manifestarDocumentoFiscal: "documents.nfe.manage",
  marcarIntegradoTotvs: "nfe.integration.manage",
  enviarCertificadoFiscal: "nfe.integration.manage",
  testarConexaoApfiscal: "nfe.integration.manage",
  salvarIntegracaoEmpresa: "nfe.integration.manage",
};

export function permissionForAction(name: string): string {
  if (specialPermissions[name]) return specialPermissions[name];
  if (name.toLowerCase().includes("product")) return readActions.has(name) ? "products.view" : "products.manage";
  if (name.toLowerCase().includes("supplier")) return readActions.has(name) ? "suppliers.view" : "suppliers.manage";
  if (/CentroCusto|PlanoContas|LocalEstoque|Alocac|TipoCompra|TipoMovimento/.test(name)) {
    return readActions.has(name) ? "finance.cost_centers.view" : "finance.cost_centers.manage";
  }
  if (/Classification/.test(name)) return readActions.has(name) ? "classifications.view" : "classifications.manage";
  return readActions.has(name) ? "documents.nfe.view" : "documents.nfe.manage";
}

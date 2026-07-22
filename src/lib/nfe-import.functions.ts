import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { XMLParser } from "fast-xml-parser";

type ImportInput = { fileName: string; xml: string };

function onlyDigits(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function parseNfe(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true,
  });
  const doc = parser.parse(xml);

  // Locate infNFe (may be under nfeProc.NFe.infNFe or NFe.infNFe)
  const nfe = doc?.nfeProc?.NFe ?? doc?.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error("XML inválido: elemento infNFe não encontrado. Certifique-se de importar uma NF-e.");

  const chave = onlyDigits(inf.Id ?? inf.chNFe ?? "");
  if (chave.length !== 44) throw new Error("Chave de acesso da NF-e inválida (esperado 44 dígitos).");

  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const total = inf.total?.ICMSTot ?? {};

  return {
    chave,
    numero: String(ide.nNF ?? ""),
    serie: String(ide.serie ?? ""),
    dataEmissao: String(ide.dhEmi ?? ide.dEmi ?? ""),
    emitente: {
      cnpj: onlyDigits(emit.CNPJ ?? emit.CPF ?? ""),
      nome: String(emit.xNome ?? ""),
      fantasia: emit.xFant ? String(emit.xFant) : null,
      ie: emit.IE ? String(emit.IE) : null,
      endereco: {
        cep: onlyDigits(emit.enderEmit?.CEP),
        logradouro: emit.enderEmit?.xLgr ?? null,
        numero: emit.enderEmit?.nro ?? null,
        complemento: emit.enderEmit?.xCpl ?? null,
        bairro: emit.enderEmit?.xBairro ?? null,
        municipio: emit.enderEmit?.xMun ?? null,
        uf: emit.enderEmit?.UF ?? null,
      },
    },
    destinatarioCnpj: onlyDigits(dest.CNPJ ?? dest.CPF ?? ""),
    valorTotal: Number(total.vNF ?? 0),
    valorImpostos: Number(total.vTotTrib ?? 0) || null,
    itens: asArray<any>(inf.det).map((d: any) => {
      const prod = d.prod ?? {};
      return {
        codigo: String(prod.cProd ?? ""),
        descricao: String(prod.xProd ?? ""),
        ncm: prod.NCM ? String(prod.NCM) : null,
        cfop: prod.CFOP ? String(prod.CFOP) : null,
        unidade: prod.uCom ? String(prod.uCom) : null,
        ean: prod.cEAN && prod.cEAN !== "SEM GTIN" ? String(prod.cEAN) : null,
        valorUnitario: Number(prod.vUnCom ?? 0) || null,
      };
    }),
  };
}

export const importNfeXml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ImportInput) => {
    if (!input?.xml) throw new Error("Conteúdo XML é obrigatório.");
    if (!input?.fileName) throw new Error("Nome do arquivo é obrigatório.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const nfe = parseNfe(data.xml);

    // Find destination company within the tenant's organizations
    if (!nfe.destinatarioCnpj) {
      throw new Error("Destinatário da NF-e não possui CNPJ/CPF.");
    }
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, organization_id, razao_social, nome_fantasia, cnpj")
      .eq("cnpj", nfe.destinatarioCnpj)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!company) {
      throw new Error(
        `A NF-e é destinada ao CNPJ ${nfe.destinatarioCnpj}, que não pertence a nenhuma empresa cadastrada na sua organização.`,
      );
    }

    // Duplicate check by chave_acesso
    const { data: existing } = await supabase
      .from("fiscal_documents")
      .select("id")
      .eq("chave_acesso", nfe.chave)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        duplicated: true,
        documentId: (existing as any).id as string,
        message: "Esta NF-e já foi importada anteriormente.",
      };
    }

    // Upsert supplier (emitente)
    let supplierId: string | null = null;
    if (nfe.emitente.cnpj) {
      const { data: supId, error: supErr } = await supabase.rpc("upsert_supplier_from_nfe", {
        _organization_id: (company as any).organization_id,
        _company_id: (company as any).id,
        _cnpj: nfe.emitente.cnpj,
        _razao_social: nfe.emitente.nome || nfe.emitente.cnpj,
        _nome_fantasia: nfe.emitente.fantasia,
        _ie: nfe.emitente.ie,
        _endereco: nfe.emitente.endereco,
      });
      if (supErr) throw new Error(`Erro ao cadastrar fornecedor: ${supErr.message}`);
      supplierId = (supId as string) ?? null;
    }

    // Upsert products
    let productsCreated = 0;
    for (const item of nfe.itens) {
      if (!item.codigo || !item.descricao) continue;
      const { error: prodErr } = await supabase.rpc("upsert_product_from_nfe", {
        _organization_id: (company as any).organization_id,
        _company_id: (company as any).id,
        _codigo: item.codigo,
        _descricao: item.descricao,
        _ncm: item.ncm,
        _cfop: item.cfop,
        _unidade: item.unidade,
        _ean: item.ean,
        _valor_unitario: item.valorUnitario,
        _supplier_id: supplierId,
      });
      if (!prodErr) productsCreated++;
    }

    // Insert fiscal document
    const { data: inserted, error: insErr } = await supabase
      .from("fiscal_documents")
      .insert({
        company_id: (company as any).id,
        tipo: "nfe",
        chave_acesso: nfe.chave,
        numero: nfe.numero || "0",
        serie: nfe.serie || null,
        emitente_cnpj: nfe.emitente.cnpj || null,
        emitente_nome: nfe.emitente.nome || null,
        valor_total: nfe.valorTotal || 0,
        valor_impostos: nfe.valorImpostos,
        data_emissao: nfe.dataEmissao || null,
        status_manifestacao: "pendente",
        situacao: "importado_manual",
        xml_path: data.fileName,
      } as never)
      .select("id")
      .single();
    if (insErr) throw new Error(`Erro ao registrar NF-e: ${insErr.message}`);

    return {
      ok: true,
      duplicated: false,
      documentId: (inserted as any).id as string,
      companyName: (company as any).razao_social as string,
      itemCount: nfe.itens.length,
      productsCreated,
      supplierCreated: !!supplierId,
    };
  });

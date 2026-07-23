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

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function maskCnpjCpf(c: string): string {
  if (c.length === 14) return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  if (c.length === 11) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
  return c;
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

  const nfeProc = doc?.nfeProc;
  const nfe = nfeProc?.NFe ?? doc?.NFe;
  const inf = nfe?.infNFe;
  if (!inf) throw new Error("XML inválido: elemento infNFe não encontrado. Certifique-se de importar uma NF-e.");

  const chave = onlyDigits(inf.Id ?? inf.chNFe ?? "");
  if (chave.length !== 44) throw new Error("Chave de acesso da NF-e inválida (esperado 44 dígitos).");

  const ide = inf.ide ?? {};
  const emit = inf.emit ?? {};
  const dest = inf.dest ?? {};
  const totalIcms = inf.total?.ICMSTot ?? {};
  const transp = inf.transp ?? {};
  const cobr = inf.cobr ?? null;
  const pag = inf.pag ?? null;
  const infAdic = inf.infAdic ?? {};
  const protNFe = nfeProc?.protNFe?.infProt ?? null;

  return {
    chave,
    numero: String(ide.nNF ?? ""),
    serie: String(ide.serie ?? ""),
    modelo: ide.mod ? String(ide.mod) : null,
    tipoOperacao: ide.tpNF ? String(ide.tpNF) : null,
    finalidade: ide.finNFe ? String(ide.finNFe) : null,
    naturezaOperacao: ide.natOp ? String(ide.natOp) : null,
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
    destinatario: {
      cnpj: onlyDigits(dest.CNPJ ?? dest.CPF ?? ""),
      nome: dest.xNome ? String(dest.xNome) : null,
      raw: dest,
    },
    totais: totalIcms,
    valorTotal: num(totalIcms.vNF) ?? 0,
    valorProdutos: num(totalIcms.vProd),
    valorImpostos: num(totalIcms.vTotTrib),
    valorFrete: num(totalIcms.vFrete),
    valorSeguro: num(totalIcms.vSeg),
    valorDesconto: num(totalIcms.vDesc),
    valorOutros: num(totalIcms.vOutro),
    transporte: transp,
    cobranca: cobr,
    pagamentos: pag,
    infAdicional: infAdic,
    protocolo: protNFe,
    ide,
    itens: asArray<any>(inf.det).map((d: any) => {
      const prod = d.prod ?? {};
      const imposto = d.imposto ?? {};
      return {
        numero: Number(d.nItem ?? 0),
        codigo: String(prod.cProd ?? ""),
        descricao: String(prod.xProd ?? ""),
        ncm: prod.NCM ? String(prod.NCM) : null,
        cest: prod.CEST ? String(prod.CEST) : null,
        cfop: prod.CFOP ? String(prod.CFOP) : null,
        unidade: prod.uCom ? String(prod.uCom) : null,
        quantidade: num(prod.qCom),
        valorUnitario: num(prod.vUnCom),
        valorBruto: num(prod.vProd),
        unidadeTrib: prod.uTrib ? String(prod.uTrib) : null,
        quantidadeTrib: num(prod.qTrib),
        valorUnitarioTrib: num(prod.vUnTrib),
        ean: prod.cEAN && prod.cEAN !== "SEM GTIN" ? String(prod.cEAN) : null,
        eanTrib: prod.cEANTrib && prod.cEANTrib !== "SEM GTIN" ? String(prod.cEANTrib) : null,
        vFrete: num(prod.vFrete),
        vSeg: num(prod.vSeg),
        vDesc: num(prod.vDesc),
        vOutro: num(prod.vOutro),
        infAdProd: d.infAdProd ? String(d.infAdProd) : null,
        produto: prod,
        impostos: imposto,
      };
    }),
    raw: doc,
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

    if (!nfe.destinatario.cnpj) {
      throw new Error("Destinatário da NF-e não possui CNPJ/CPF.");
    }
    const c = nfe.destinatario.cnpj;
    const maskedDest = maskCnpjCpf(c);
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, organization_id, razao_social, nome_fantasia, cnpj")
      .in("cnpj", [maskedDest, c])
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!company) {
      throw new Error(
        `A NF-e é destinada ao CNPJ ${maskedDest}, que não pertence a nenhuma empresa cadastrada na sua organização.`,
      );
    }

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

    const orgId = (company as any).organization_id as string;
    const companyId = (company as any).id as string;
    const { data: org } = await supabase
      .from("organizations")
      .select("catalog_scope")
      .eq("id", orgId)
      .maybeSingle();
    const isGlobal = (org as any)?.catalog_scope === "global";

    // Supplier
    let supplierId: string | null = null;
    let supplierCreated = false;
    let supplierExisted = false;
    if (nfe.emitente.cnpj) {
      const ec = nfe.emitente.cnpj;
      const maskedEmit = maskCnpjCpf(ec);

      let supplierQuery = supabase
        .from("suppliers")
        .select("id")
        .eq("organization_id", orgId)
        .in("cnpj_cpf", [maskedEmit, ec]);
      if (!isGlobal) supplierQuery = supplierQuery.eq("company_id", companyId);

      const { data: existingSupplier } = await supplierQuery.limit(1).maybeSingle();
      if (existingSupplier) {
        supplierId = (existingSupplier as any).id as string;
        supplierExisted = true;
      } else {
        const { data: supId, error: supErr } = await supabase.rpc("upsert_supplier_from_nfe", {
          _organization_id: orgId,
          _company_id: companyId,
          _cnpj: nfe.emitente.cnpj,
          _razao_social: nfe.emitente.nome || nfe.emitente.cnpj,
          _nome_fantasia: nfe.emitente.fantasia ?? undefined,
          _ie: nfe.emitente.ie ?? undefined,
          _endereco: nfe.emitente.endereco,
        });
        if (supErr) throw new Error(`Erro ao cadastrar fornecedor: ${supErr.message}`);
        supplierId = (supId as string) ?? null;
        supplierCreated = true;
      }
    }

    // Vincula item -> produto SOMENTE se já existir vínculo produtos_fornecedores (fornecedor + código do item na nota).
    let itemsLinked = 0;
    let itemsPending = 0;
    const productIdByCodigo = new Map<string, string>();
    if (supplierId) {
      const codigos = Array.from(new Set(nfe.itens.map((i) => i.codigo).filter(Boolean)));
      if (codigos.length) {
        let linkQuery = supabase
          .from("produtos_fornecedores")
          .select("produto_id, codigo_item_nota, empresa_id")
          .eq("organization_id", orgId)
          .eq("fornecedor_id", supplierId)
          .in("codigo_item_nota", codigos);
        if (!isGlobal) linkQuery = linkQuery.eq("empresa_id", companyId);
        const { data: links } = await linkQuery;
        for (const l of (links ?? []) as any[]) {
          productIdByCodigo.set(l.codigo_item_nota, l.produto_id);
        }
      }
    }
    for (const item of nfe.itens) {
      if (item.codigo && productIdByCodigo.has(item.codigo)) itemsLinked++;
      else itemsPending++;
    }

    // Insert fiscal document with full payload
    const protoc = nfe.protocolo as any;
    const { data: inserted, error: insErr } = await supabase
      .from("fiscal_documents")
      .insert({
        company_id: companyId,
        tipo: "nfe",
        chave_acesso: nfe.chave,
        numero: nfe.numero || "0",
        serie: nfe.serie || null,
        modelo: nfe.modelo,
        tipo_operacao: nfe.tipoOperacao,
        finalidade: nfe.finalidade,
        natureza_operacao: nfe.naturezaOperacao,
        emitente_cnpj: nfe.emitente.cnpj || null,
        emitente_nome: nfe.emitente.nome || null,
        destinatario_cnpj: nfe.destinatario.cnpj || null,
        destinatario_nome: nfe.destinatario.nome,
        valor_total: nfe.valorTotal || 0,
        valor_impostos: nfe.valorImpostos,
        valor_produtos: nfe.valorProdutos,
        valor_frete: nfe.valorFrete,
        valor_seguro: nfe.valorSeguro,
        valor_desconto: nfe.valorDesconto,
        valor_outros: nfe.valorOutros,
        data_emissao: nfe.dataEmissao || null,
        status_manifestacao: "pendente",
        situacao: "importado_manual",
        xml_path: data.fileName,
        xml_content: data.xml,
        ide: nfe.ide,
        emitente: nfe.emitente,
        destinatario: nfe.destinatario.raw,
        totais: nfe.totais,
        transporte: nfe.transporte,
        cobranca: nfe.cobranca,
        pagamentos: nfe.pagamentos,
        inf_adicional: nfe.infAdicional,
        protocolo: protoc?.nProt ? String(protoc.nProt) : null,
        data_autorizacao: protoc?.dhRecbto ? String(protoc.dhRecbto) : null,
        raw_payload: nfe.raw,
      } as never)
      .select("id")
      .single();
    if (insErr) throw new Error(`Erro ao registrar NF-e: ${insErr.message}`);

    const documentId = (inserted as any).id as string;

    // Insert items
    if (nfe.itens.length > 0) {
      const itemRows = nfe.itens.map((it) => ({
        document_id: documentId,
        product_id: it.codigo ? productIdByCodigo.get(it.codigo) ?? null : null,
        numero_item: it.numero,
        codigo: it.codigo || null,
        descricao: it.descricao || null,
        ncm: it.ncm,
        cest: it.cest,
        cfop: it.cfop,
        unidade_comercial: it.unidade,
        quantidade_comercial: it.quantidade,
        valor_unitario_comercial: it.valorUnitario,
        valor_bruto: it.valorBruto,
        unidade_tributavel: it.unidadeTrib,
        quantidade_tributavel: it.quantidadeTrib,
        valor_unitario_tributavel: it.valorUnitarioTrib,
        ean: it.ean,
        ean_tributavel: it.eanTrib,
        valor_frete: it.vFrete,
        valor_seguro: it.vSeg,
        valor_desconto: it.vDesc,
        valor_outros: it.vOutro,
        valor_total: it.valorBruto,
        produto: it.produto,
        impostos: it.impostos,
        inf_adicional: it.infAdProd,
      }));
      const { error: itemsErr } = await supabase.from("fiscal_document_items").insert(itemRows as never);
      if (itemsErr) throw new Error(`Erro ao registrar itens: ${itemsErr.message}`);
    }

    // Insert authorization event (if present)
    if (protoc) {
      await supabase.from("fiscal_document_events").insert({
        document_id: documentId,
        tipo_evento: "autorizacao",
        codigo_evento: protoc.cStat ? String(protoc.cStat) : null,
        descricao: protoc.xMotivo ? String(protoc.xMotivo) : null,
        protocolo: protoc.nProt ? String(protoc.nProt) : null,
        data_evento: protoc.dhRecbto ? String(protoc.dhRecbto) : null,
        payload: protoc,
      } as never);
    }

    return {
      ok: true,
      duplicated: false,
      documentId,
      companyName: (company as any).razao_social as string,
      itemCount: nfe.itens.length,
      productsCreated,
      productsExisted,
      supplierCreated,
      supplierExisted,
    };
  });

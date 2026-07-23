import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProdutoInput = {
  id?: string;
  company_id: string | null;
  codigo_interno: string;
  descricao: string;
  unidade: string;
  ean_gtin?: string | null;
  ncm: string;
  cest?: string | null;
  origem_mercadoria: number;
  familia_id?: string | null;
  grupo_id?: string | null;
  subgrupo_id?: string | null;
  ativo?: boolean;
};

async function resolveOrganizationId(context: { supabase: any }, companyId: string | null): Promise<string> {
  if (companyId) {
    const { data: company, error } = await context.supabase
      .from("companies").select("organization_id").eq("id", companyId).maybeSingle();
    if (error || !company) throw new Error("Empresa não encontrada");
    return company.organization_id as string;
  }
  const { data: orgId, error } = await context.supabase.rpc("ensure_user_organization");
  if (error || !orgId) throw new Error("Organização não encontrada");
  return orgId as string;
}

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId?: string }) => data)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("produtos")
      .select("*, companies(razao_social, cnpj), familias(codigo, descricao), grupos(codigo, descricao), subgrupos(codigo, descricao)")
      .order("descricao");
    if (data.companyId) q = q.eq("company_id", data.companyId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProduct = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("produtos")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProdutoInput) => {
    if (!data.codigo_interno?.trim()) throw new Error("Código interno é obrigatório");
    if (!data.descricao?.trim()) throw new Error("Descrição é obrigatória");
    if (!data.unidade?.trim()) throw new Error("Unidade é obrigatória");
    if (!/^\d{8}$/.test(data.ncm ?? "")) throw new Error("NCM deve ter 8 dígitos numéricos");
    if (data.origem_mercadoria < 0 || data.origem_mercadoria > 8) throw new Error("Origem inválida (0 a 8)");
    return data;
  })
  .handler(async ({ data, context }) => {
    const organization_id = await resolveOrganizationId(context, data.company_id);
    const payload: any = {
      organization_id,
      company_id: data.company_id ?? null,
      codigo_interno: data.codigo_interno.trim(),
      descricao: data.descricao.trim(),
      unidade: data.unidade.trim(),
      ean_gtin: data.ean_gtin || null,
      ncm: data.ncm,
      cest: data.cest || null,
      origem_mercadoria: data.origem_mercadoria,
      familia_id: data.familia_id || null,
      grupo_id: data.grupo_id || null,
      subgrupo_id: data.subgrupo_id || null,
      ativo: data.ativo ?? true,
    };
    if (data.id) {
      const { error } = await context.supabase.from("produtos").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase.from("produtos").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("produtos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data, context }) => {
    if (!data.ids?.length) return { ok: true, count: 0 };
    const { error, count } = await context.supabase
      .from("produtos").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? data.ids.length };
  });

// ----------- Produto x Fornecedor -----------
export type ProdutoFornecedorInput = {
  id?: string;
  produto_id: string;
  fornecedor_id: string;
  codigo_item_nota: string;
  empresa_id?: string | null;
};

export const listProductSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { produtoId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("produtos_fornecedores")
      .select("*, suppliers(id, razao_social, nome_fantasia, cnpj_cpf, codigo_interno)")
      .eq("produto_id", data.produtoId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const saveProductSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ProdutoFornecedorInput) => {
    if (!data.produto_id) throw new Error("Produto obrigatório");
    if (!data.fornecedor_id) throw new Error("Fornecedor obrigatório");
    if (!data.codigo_item_nota?.trim()) throw new Error("Código do item na nota é obrigatório");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: produto, error: pErr } = await context.supabase
      .from("produtos").select("organization_id, company_id").eq("id", data.produto_id).maybeSingle();
    if (pErr || !produto) throw new Error("Produto não encontrado");
    const payload: any = {
      organization_id: (produto as any).organization_id,
      empresa_id: data.empresa_id ?? (produto as any).company_id ?? null,
      produto_id: data.produto_id,
      fornecedor_id: data.fornecedor_id,
      codigo_item_nota: data.codigo_item_nota.trim(),
    };
    if (data.id) {
      const { error } = await context.supabase.from("produtos_fornecedores").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("produtos_fornecedores").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (inserted as any).id as string };
  });

export const deleteProductSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("produtos_fornecedores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------- Item da NF-e: vincular a produto existente / criar novo -----------
export const linkNfeItemToProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; produtoId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: item, error: iErr } = await context.supabase
      .from("fiscal_document_items")
      .select("id, codigo, document_id, fiscal_documents(company_id, emitente_cnpj, emitente_nome, companies(organization_id))")
      .eq("id", data.itemId)
      .maybeSingle();
    if (iErr || !item) throw new Error("Item não encontrado");
    const doc: any = (item as any).fiscal_documents;
    const orgId: string | null = doc?.companies?.organization_id ?? null;
    const companyId: string | null = doc?.company_id ?? null;
    const emitCnpj: string | null = doc?.emitente_cnpj ?? null;
    const emitNome: string | null = doc?.emitente_nome ?? null;
    const codigo: string | null = (item as any).codigo ?? null;

    if (orgId && emitCnpj && codigo) {
      const digits = emitCnpj.replace(/\D/g, "");
      let supplierId: string | null = null;
      const { data: sup, error: sErr } = await context.supabase
        .from("suppliers").select("id")
        .eq("organization_id", orgId)
        .or(`cnpj_cpf.eq.${emitCnpj},cnpj_cpf.eq.${digits}`)
        .limit(1).maybeSingle();
      if (sErr) throw new Error(`Falha ao localizar fornecedor: ${sErr.message}`);
      if (sup) {
        supplierId = (sup as any).id as string;
      } else {
        // Cria automaticamente o fornecedor a partir dos dados do emitente da NF-e
        const { data: newSupId, error: upsertErr } = await context.supabase.rpc("upsert_supplier_from_nfe", {
          _organization_id: orgId,
          _company_id: (companyId ?? undefined) as any,
          _cnpj: digits,
          _razao_social: emitNome ?? `Fornecedor ${digits}`,
        });
        if (upsertErr) throw new Error(`Falha ao cadastrar fornecedor da nota: ${upsertErr.message}`);
        supplierId = (newSupId as string | null) ?? null;
      }

      if (supplierId) {
        // Verifica manualmente antes de inserir: os índices UNIQUE são parciais
        // (empresa_id NULL vs NOT NULL), e ON CONFLICT falha silenciosamente
        // quando o índice esperado não cobre a linha.
        let existingQ = context.supabase
          .from("produtos_fornecedores")
          .select("id, produto_id")
          .eq("fornecedor_id", supplierId)
          .eq("codigo_item_nota", codigo)
          .limit(1);
        existingQ = companyId
          ? existingQ.eq("empresa_id", companyId)
          : existingQ.is("empresa_id", null);
        const { data: existing, error: eErr } = await existingQ.maybeSingle();
        if (eErr) throw new Error(`Falha ao verificar vínculo existente: ${eErr.message}`);

        if (!existing) {
          const { error: insErr } = await context.supabase.from("produtos_fornecedores").insert({
            organization_id: orgId,
            empresa_id: companyId,
            produto_id: data.produtoId,
            fornecedor_id: supplierId,
            codigo_item_nota: codigo,
          });
          if (insErr) throw new Error(`Falha ao vincular fornecedor ao produto: ${insErr.message}`);
        } else if ((existing as any).produto_id !== data.produtoId) {
          const { error: updErr } = await context.supabase
            .from("produtos_fornecedores")
            .update({ produto_id: data.produtoId })
            .eq("id", (existing as any).id);
          if (updErr) throw new Error(`Falha ao atualizar vínculo do fornecedor: ${updErr.message}`);
        }
      }
    }

    const { error } = await context.supabase
      .from("fiscal_document_items")
      .update({ product_id: data.produtoId, status_vinculo: "vinculado" })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Contexto completo para o modal de vínculo manual
export const getNfeItemLinkContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: item, error: iErr } = await context.supabase
      .from("fiscal_document_items")
      .select("id, codigo, descricao, ncm, unidade_comercial, quantidade_comercial, valor_unitario_comercial, cest, ean, document_id, product_id, status_vinculo, impostos")
      .eq("id", data.itemId)
      .maybeSingle();
    if (iErr || !item) throw new Error("Item não encontrado");

    const { data: doc } = await context.supabase
      .from("fiscal_documents")
      .select("id, company_id, emitente_cnpj, emitente_nome, numero, serie, companies(id, razao_social, organization_id)")
      .eq("id", (item as any).document_id)
      .maybeSingle();

    const orgId = (doc as any)?.companies?.organization_id ?? null;
    const companyId = (doc as any)?.company_id ?? null;
    const emitCnpj: string | null = (doc as any)?.emitente_cnpj ?? null;

    let supplier: { id: string; razao_social: string; cnpj_cpf: string } | null = null;
    if (emitCnpj && orgId) {
      const { data: sup } = await context.supabase
        .from("suppliers")
        .select("id, razao_social, cnpj_cpf")
        .eq("organization_id", orgId)
        .or(`cnpj_cpf.eq.${emitCnpj},cnpj_cpf.eq.${emitCnpj.replace(/\D/g, "")}`)
        .limit(1)
        .maybeSingle();
      if (sup) supplier = sup as any;
    }

    // Já existe vínculo (fornecedor + código) apontando para outro produto?
    let conflictingLink: { produto_id: string; codigo_interno: string; descricao: string } | null = null;
    if (supplier && (item as any).codigo) {
      const { data: existing } = await context.supabase
        .from("produtos_fornecedores")
        .select("produto_id, produtos(codigo_interno, descricao)")
        .eq("fornecedor_id", supplier.id)
        .eq("codigo_item_nota", (item as any).codigo)
        .limit(1)
        .maybeSingle();
      if (existing) {
        conflictingLink = {
          produto_id: (existing as any).produto_id,
          codigo_interno: (existing as any).produtos?.codigo_interno ?? "",
          descricao: (existing as any).produtos?.descricao ?? "",
        };
      }
    }

    return {
      item,
      document: {
        id: (doc as any)?.id,
        numero: (doc as any)?.numero,
        serie: (doc as any)?.serie,
        company_id: companyId,
        emitente_cnpj: emitCnpj,
        emitente_nome: (doc as any)?.emitente_nome ?? (doc as any)?.companies?.razao_social ?? null,
      },
      supplier,
      conflictingLink,
    };
  });

// Buscar produtos por texto (para o modal), restrito ao escopo da empresa da NF-e
export const searchProductsForLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { companyId: string | null; query: string }) => data)
  .handler(async ({ data, context }) => {
    const q = (data.query ?? "").trim();
    // organização do usuário para incluir globais
    const { data: orgId } = await context.supabase.rpc("ensure_user_organization");

    let query = context.supabase
      .from("produtos")
      .select("id, codigo_interno, descricao, unidade, ncm, company_id, familias(codigo, descricao), grupos(codigo, descricao), subgrupos(codigo, descricao)")
      .eq("ativo", true)
      .limit(50);

    if (data.companyId) {
      query = query.or(`company_id.eq.${data.companyId},company_id.is.null`);
    } else {
      query = query.eq("organization_id", orgId as any);
    }
    if (q) {
      const safe = q.replace(/[%,]/g, " ");
      query = query.or(`descricao.ilike.%${safe}%,codigo_interno.ilike.%${safe}%,ncm.ilike.%${safe}%,ean_gtin.ilike.%${safe}%`);
    }
    const { data: rows, error } = await query.order("descricao").limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// Criar produto novo + vincular ao item da NF-e em uma única operação
export const createProductAndLinkItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; produto: ProdutoInput }) => {
    const p = data.produto;
    if (!p.codigo_interno?.trim()) throw new Error("Código interno é obrigatório");
    if (!p.descricao?.trim()) throw new Error("Descrição é obrigatória");
    if (!p.unidade?.trim()) throw new Error("Unidade é obrigatória");
    if (!/^\d{8}$/.test(p.ncm ?? "")) throw new Error("NCM deve ter 8 dígitos numéricos");
    if (p.origem_mercadoria < 0 || p.origem_mercadoria > 8) throw new Error("Origem inválida (0 a 8)");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: item, error: iErr } = await context.supabase
      .from("fiscal_document_items")
      .select("id, codigo, document_id, fiscal_documents(company_id, emitente_cnpj, companies(organization_id))")
      .eq("id", data.itemId)
      .maybeSingle();
    if (iErr || !item) throw new Error("Item da NF-e não encontrado");

    const doc: any = (item as any).fiscal_documents;
    const orgId: string | null = doc?.companies?.organization_id ?? null;
    const companyIdDoc: string | null = doc?.company_id ?? null;
    const emitCnpj: string | null = doc?.emitente_cnpj ?? null;
    if (!orgId) throw new Error("Organização não encontrada");

    // Localiza fornecedor
    let supplierId: string | null = null;
    if (emitCnpj) {
      const { data: sup } = await context.supabase
        .from("suppliers").select("id")
        .eq("organization_id", orgId)
        .or(`cnpj_cpf.eq.${emitCnpj},cnpj_cpf.eq.${emitCnpj.replace(/\D/g, "")}`)
        .limit(1).maybeSingle();
      supplierId = (sup as any)?.id ?? null;
    }
    if (!supplierId) throw new Error("Fornecedor da NF-e não localizado no cadastro. Cadastre o fornecedor antes de vincular.");

    // 1) Criar produto
    const p = data.produto;
    const productPayload: any = {
      organization_id: orgId,
      company_id: p.company_id ?? companyIdDoc ?? null,
      codigo_interno: p.codigo_interno.trim(),
      descricao: p.descricao.trim(),
      unidade: p.unidade.trim(),
      ean_gtin: p.ean_gtin || null,
      ncm: p.ncm,
      cest: p.cest || null,
      origem_mercadoria: p.origem_mercadoria,
      familia_id: p.familia_id || null,
      grupo_id: p.grupo_id || null,
      subgrupo_id: p.subgrupo_id || null,
      ativo: p.ativo ?? true,
    };
    const { data: created, error: cErr } = await context.supabase
      .from("produtos").insert(productPayload).select("id").single();
    if (cErr) throw new Error(`Falha ao criar produto: ${cErr.message}`);
    const produtoId = (created as any).id as string;

    // 2) Criar vínculo produto x fornecedor (verifica antes; índices UNIQUE são parciais)
    if ((item as any).codigo) {
      let existQ = context.supabase
        .from("produtos_fornecedores")
        .select("id")
        .eq("fornecedor_id", supplierId)
        .eq("codigo_item_nota", (item as any).codigo)
        .limit(1);
      existQ = companyIdDoc ? existQ.eq("empresa_id", companyIdDoc) : existQ.is("empresa_id", null);
      const { data: existingPf } = await existQ.maybeSingle();
      if (existingPf) {
        const { error: updErr } = await context.supabase
          .from("produtos_fornecedores")
          .update({ produto_id: produtoId })
          .eq("id", (existingPf as any).id);
        if (updErr) {
          await context.supabase.from("produtos").delete().eq("id", produtoId);
          throw new Error(`Falha ao vincular fornecedor: ${updErr.message}`);
        }
      } else {
        const { error: pfErr } = await context.supabase.from("produtos_fornecedores").insert({
          organization_id: orgId,
          empresa_id: companyIdDoc,
          produto_id: produtoId,
          fornecedor_id: supplierId,
          codigo_item_nota: (item as any).codigo,
        });
        if (pfErr) {
          await context.supabase.from("produtos").delete().eq("id", produtoId);
          throw new Error(`Falha ao vincular fornecedor: ${pfErr.message}`);
        }
      }
    }

    // 3) Atualizar item da nota
    const { error: upErr } = await context.supabase
      .from("fiscal_document_items")
      .update({ product_id: produtoId, status_vinculo: "vinculado" })
      .eq("id", data.itemId);
    if (upErr) {
      await context.supabase.from("produtos_fornecedores").delete()
        .eq("produto_id", produtoId).eq("fornecedor_id", supplierId);
      await context.supabase.from("produtos").delete().eq("id", produtoId);
      throw new Error(`Falha ao atualizar item da NF-e: ${upErr.message}`);
    }

    return { ok: true, produtoId, codigo_interno: p.codigo_interno.trim(), descricao: p.descricao.trim() };
  });

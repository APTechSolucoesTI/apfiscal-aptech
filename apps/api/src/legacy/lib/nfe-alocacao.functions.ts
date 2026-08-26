import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  distribuirCabecalhoParaItens,
  recalcularAlocacaoCabecalho,
  type CentroCustoAlocacao,
} from "./nfe-alocacao";
import { reavaliarApontamentos } from "./nfe-status.functions";
import { podeEditarApontamentos } from "./nfe-status";

async function assertEditavel(context: any, documentId: string) {
  const { data: doc } = await (context.supabase as any)
    .from("fiscal_documents")
    .select("status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new Error("NF-e não encontrada");
  if (!podeEditarApontamentos(doc.status)) {
    throw new Error(
      doc.status === "integrado_totvs"
        ? "NF-e já integrada na TOTVS: os apontamentos não podem mais ser alterados."
        : "Esta NF-e precisa ser aprovada antes de realizar os apontamentos.",
    );
  }
}

async function documentIdFromItem(context: any, itemId: string) {
  const { data } = await (context.supabase as any)
    .from("fiscal_document_items")
    .select("document_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!data) throw new Error("Item não encontrado");
  return data.document_id as string;
}

export const setCobrancaManual = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      documentId: string;
      parcelas: Array<{ numero: string; vencimento: string; valor: number }>;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertEditavel(context, data.documentId);
    const { data: doc, error } = await context.supabase
      .from("fiscal_documents")
      .select("valor_total, cobranca")
      .eq("id", data.documentId)
      .maybeSingle();
    if (error || !doc) throw new Error("Documento fiscal não encontrado.");
    if (!data.parcelas.length || data.parcelas.length > 120)
      throw new Error("Informe de 1 a 120 parcelas.");
    const parcelas = data.parcelas.map((parcela, index) => {
      const due = new Date(`${parcela.vencimento}T12:00:00`);
      const value = Math.round(Number(parcela.valor) * 100) / 100;
      if (Number.isNaN(due.getTime()) || value <= 0)
        throw new Error(`Parcela ${index + 1} possui vencimento ou valor inválido.`);
      return {
        nDup: parcela.numero.trim() || String(index + 1).padStart(3, "0"),
        dVenc: parcela.vencimento,
        vDup: value.toFixed(2),
      };
    });
    const total = parcelas.reduce((sum, parcela) => sum + Number(parcela.vDup), 0);
    const documentTotal = Number(doc.valor_total ?? 0);
    if (Math.abs(total - documentTotal) > 0.01)
      throw new Error(
        `A soma das parcelas (${total.toFixed(2)}) deve ser igual ao total da nota (${documentTotal.toFixed(2)}).`,
      );
    const current =
      doc.cobranca && typeof doc.cobranca === "object" && !Array.isArray(doc.cobranca)
        ? (doc.cobranca as Record<string, unknown>)
        : {};
    const currentInvoice =
      current.fat && typeof current.fat === "object" && !Array.isArray(current.fat)
        ? (current.fat as Record<string, unknown>)
        : {};
    const updated = await context.supabase
      .from("fiscal_documents")
      .update({
        cobranca: {
          ...current,
          fat: {
            nFat: String(currentInvoice.nFat ?? "MANUAL"),
            vOrig: documentTotal.toFixed(2),
            vDesc: "0.00",
            vLiq: documentTotal.toFixed(2),
          },
          dup: parcelas,
          origem: "manual",
        },
      })
      .eq("id", data.documentId);
    if (updated.error) throw new Error(updated.error.message);
    return { ok: true, parcelas: parcelas.length, total };
  });

export const sugerirApontamentosFinanceiros = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertEditavel(context, data.documentId);
    const current = await context.supabase
      .from("fiscal_documents")
      .select("id, company_id, supplier_id, tipo, valor_total")
      .eq("id", data.documentId)
      .single();
    if (current.error) throw new Error(current.error.message);
    const candidates = await context.supabase
      .from("fiscal_documents")
      .select("id, numero, plano_contas_id, local_estoque_id, tipo_compra_id, status_updated_at")
      .eq("company_id", current.data.company_id)
      .eq("supplier_id", current.data.supplier_id)
      .eq("tipo", current.data.tipo)
      .eq("status", "integrado_totvs")
      .neq("id", data.documentId)
      .order("status_updated_at", { ascending: false })
      .limit(25);
    if (candidates.error) throw new Error(candidates.error.message);
    if (!candidates.data?.length)
      throw new Error("Ainda não existe documento integrado deste fornecedor para gerar sugestão.");
    const currentItems = await context.supabase
      .from("fiscal_document_items")
      .select("id, product_id, valor_bruto")
      .eq("document_id", data.documentId);
    if (currentItems.error) throw new Error(currentItems.error.message);
    const candidateItems = await context.supabase
      .from("fiscal_document_items")
      .select("document_id, product_id")
      .in(
        "document_id",
        candidates.data.map((candidate) => candidate.id),
      );
    if (candidateItems.error) throw new Error(candidateItems.error.message);
    const products = new Set(
      (currentItems.data ?? []).map((item) => item.product_id).filter(Boolean),
    );
    const source = [...candidates.data].sort((a, b) => {
      const score = (id: string) =>
        (candidateItems.data ?? []).filter(
          (item) => item.document_id === id && item.product_id && products.has(item.product_id),
        ).length;
      return score(b.id) - score(a.id);
    })[0];
    const sourceRates = await context.supabase
      .from("nfe_centro_custo")
      .select("centro_custo_id, valor")
      .eq("document_id", source.id);
    if (sourceRates.error) throw new Error(sourceRates.error.message);
    const sourceTotal = (sourceRates.data ?? []).reduce((sum, rate) => sum + Number(rate.valor), 0);
    const targetTotal = Number(current.data.valor_total ?? 0);
    const headerRates =
      sourceTotal > 0
        ? (sourceRates.data ?? []).map((rate, index, all) => ({
            centro_custo_id: rate.centro_custo_id,
            valor:
              index === all.length - 1
                ? Math.round(
                    (targetTotal -
                      all
                        .slice(0, -1)
                        .reduce(
                          (sum, previous) =>
                            sum +
                            Math.round((Number(previous.valor) / sourceTotal) * targetTotal * 100) /
                              100,
                          0,
                        )) *
                      100,
                  ) / 100
                : Math.round((Number(rate.valor) / sourceTotal) * targetTotal * 100) / 100,
          }))
        : [];
    const fields = {
      plano_contas_id: source.plano_contas_id,
      local_estoque_id: source.local_estoque_id,
      tipo_compra_id: source.tipo_compra_id,
    };
    const documentUpdate = await context.supabase
      .from("fiscal_documents")
      .update(fields)
      .eq("id", data.documentId);
    if (documentUpdate.error) throw new Error(documentUpdate.error.message);
    const itemUpdate = await context.supabase
      .from("fiscal_document_items")
      .update({
        ...fields,
        plano_contas_alterado_manualmente: false,
        local_estoque_alterado_manualmente: false,
        tipo_compra_alterado_manualmente: false,
      })
      .eq("document_id", data.documentId);
    if (itemUpdate.error) throw new Error(itemUpdate.error.message);
    if (headerRates.length) {
      await context.supabase.from("nfe_centro_custo").delete().eq("document_id", data.documentId);
      const inserted = await context.supabase
        .from("nfe_centro_custo")
        .insert(headerRates.map((rate) => ({ document_id: data.documentId, ...rate })));
      if (inserted.error) throw new Error(inserted.error.message);
      const distribution = distribuirCabecalhoParaItens(
        headerRates,
        (currentItems.data ?? []).map((item) => ({
          id: item.id,
          valor_bruto: Number(item.valor_bruto ?? 0),
        })),
      );
      const ids = (currentItems.data ?? []).map((item) => item.id);
      if (ids.length)
        await context.supabase.from("nfe_item_centro_custo").delete().in("document_item_id", ids);
      const rows = Object.entries(distribution).flatMap(([itemId, rates]) =>
        rates.map((rate) => ({ document_item_id: itemId, ...rate })),
      );
      if (rows.length) {
        const insertedItems = await context.supabase.from("nfe_item_centro_custo").insert(rows);
        if (insertedItems.error) throw new Error(insertedItems.error.message);
      }
    }
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true, sourceDocumentNumber: source.numero };
  });

// ---------- Plano de Contas (NF-e) ----------

export const setPlanoContasCabecalho = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { documentId: string; planoContasId: string | null; sobrescreverItens: boolean }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    await assertEditavel(context, data.documentId);
    const { error } = await context.supabase
      .from("fiscal_documents")
      .update({ plano_contas_id: data.planoContasId } as any)
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    // Propaga para itens
    let itemsQ = context.supabase
      .from("fiscal_document_items")
      .update({
        plano_contas_id: data.planoContasId,
        plano_contas_alterado_manualmente: false,
      } as any)
      .eq("document_id", data.documentId);
    if (!data.sobrescreverItens) {
      itemsQ = itemsQ.eq("plano_contas_alterado_manualmente", false as any);
    }
    const { error: e2 } = await itemsQ;
    if (e2) throw new Error(e2.message);
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true };
  });

export const setPlanoContasItem = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; planoContasId: string | null }) => data)
  .handler(async ({ data, context }) => {
    const docId = await documentIdFromItem(context, data.itemId);
    await assertEditavel(context, docId);
    const { error } = await context.supabase
      .from("fiscal_document_items")
      .update({
        plano_contas_id: data.planoContasId,
        plano_contas_alterado_manualmente: true,
      } as any)
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    await reavaliarApontamentos(context, docId);
    return { ok: true };
  });

// ---------- Local de Estoque (NF-e) ----------

export const setLocalEstoqueCabecalho = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { documentId: string; localEstoqueId: string | null; sobrescreverItens: boolean }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    await assertEditavel(context, data.documentId);
    const { error } = await (context.supabase as any)
      .from("fiscal_documents")
      .update({ local_estoque_id: data.localEstoqueId })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);
    let itemsQ = (context.supabase as any)
      .from("fiscal_document_items")
      .update({ local_estoque_id: data.localEstoqueId, local_estoque_alterado_manualmente: false })
      .eq("document_id", data.documentId);
    if (!data.sobrescreverItens) {
      itemsQ = itemsQ.eq("local_estoque_alterado_manualmente", false);
    }
    const { error: e2 } = await itemsQ;
    if (e2) throw new Error(e2.message);
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true };
  });

export const setLocalEstoqueItem = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; localEstoqueId: string | null }) => data)
  .handler(async ({ data, context }) => {
    const docId = await documentIdFromItem(context, data.itemId);
    await assertEditavel(context, docId);
    const { error } = await (context.supabase as any)
      .from("fiscal_document_items")
      .update({
        local_estoque_id: data.localEstoqueId,
        local_estoque_alterado_manualmente: data.localEstoqueId !== null,
      })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    await reavaliarApontamentos(context, docId);
    return { ok: true };
  });

// ---------- Rateio de Centro de Custo ----------

export const getAlocacaoNfe = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => data)
  .handler(async ({ data, context }) => {
    const [{ data: cab }, { data: itens }] = await Promise.all([
      (context.supabase as any)
        .from("nfe_centro_custo")
        .select("id, centro_custo_id, valor")
        .eq("document_id", data.documentId),
      (context.supabase as any)
        .from("nfe_item_centro_custo")
        .select("id, document_item_id, centro_custo_id, valor")
        .in(
          "document_item_id",
          (
            (
              await (context.supabase as any)
                .from("fiscal_document_items")
                .select("id")
                .eq("document_id", data.documentId)
            ).data ?? []
          ).map((r: any) => r.id) as any,
        ),
    ]);
    return { cabecalho: (cab ?? []) as any[], itens: (itens ?? []) as any[] };
  });

export const setAlocacoesItem = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; alocacoes: CentroCustoAlocacao[] }) => data)
  .handler(async ({ data, context }) => {
    // Valida limite (frontend também valida, mas garantimos no server)
    const { data: item } = await (context.supabase as any)
      .from("fiscal_document_items")
      .select("id, document_id, valor_bruto")
      .eq("id", data.itemId)
      .maybeSingle();
    if (!item) throw new Error("Item não encontrado");
    await assertEditavel(context, item.document_id);
    const soma = data.alocacoes.reduce((s, a) => s + Number(a.valor || 0), 0);
    if (soma > Number(item.valor_bruto || 0) + 0.005) {
      throw new Error(
        `Soma dos centros de custo (R$ ${soma.toFixed(2)}) excede o valor do item (R$ ${Number(item.valor_bruto).toFixed(2)})`,
      );
    }
    // Substitui: apaga e reinsere
    await (context.supabase as any)
      .from("nfe_item_centro_custo")
      .delete()
      .eq("document_item_id", data.itemId);
    if (data.alocacoes.length > 0) {
      const rows = data.alocacoes
        .filter((a) => Number(a.valor) > 0)
        .map((a) => ({
          document_item_id: data.itemId,
          centro_custo_id: a.centro_custo_id,
          valor: Number(a.valor),
        }));
      if (rows.length > 0) {
        const { error } = await (context.supabase as any)
          .from("nfe_item_centro_custo")
          .insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    // Recalcula cabeçalho consolidado
    await recalcularECommitCabecalho(context, item.document_id);
    await reavaliarApontamentos(context, item.document_id);
    return { ok: true };
  });

export const setAlocacoesCabecalho = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { documentId: string; alocacoes: CentroCustoAlocacao[]; propagarParaItens: boolean }) =>
      data,
  )
  .handler(async ({ data, context }) => {
    await assertEditavel(context, data.documentId);
    const { data: doc } = await (context.supabase as any)
      .from("fiscal_documents")
      .select("id, valor_total")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc) throw new Error("NF-e não encontrada");
    const soma = data.alocacoes.reduce((s, a) => s + Number(a.valor || 0), 0);
    if (soma > Number(doc.valor_total || 0) + 0.005) {
      throw new Error(
        `Soma (R$ ${soma.toFixed(2)}) excede o valor total da NF-e (R$ ${Number(doc.valor_total).toFixed(2)})`,
      );
    }
    if (data.propagarParaItens) {
      const { data: itens } = await (context.supabase as any)
        .from("fiscal_document_items")
        .select("id, valor_bruto")
        .eq("document_id", data.documentId);
      const distribuicao = distribuirCabecalhoParaItens(
        data.alocacoes,
        (itens ?? []).map((i: any) => ({ id: i.id, valor_bruto: Number(i.valor_bruto || 0) })),
      );
      // Apaga tudo dos itens
      const ids = (itens ?? []).map((i: any) => i.id);
      if (ids.length > 0) {
        await (context.supabase as any)
          .from("nfe_item_centro_custo")
          .delete()
          .in("document_item_id", ids);
      }
      const rows: any[] = [];
      for (const [itemId, allocs] of Object.entries(distribuicao)) {
        for (const a of allocs)
          rows.push({
            document_item_id: itemId,
            centro_custo_id: a.centro_custo_id,
            valor: a.valor,
          });
      }
      if (rows.length > 0) {
        const { error } = await (context.supabase as any)
          .from("nfe_item_centro_custo")
          .insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    // Grava cabeçalho: apaga e reinsere
    await (context.supabase as any)
      .from("nfe_centro_custo")
      .delete()
      .eq("document_id", data.documentId);
    const cabRows = data.alocacoes
      .filter((a) => Number(a.valor) > 0)
      .map((a) => ({
        document_id: data.documentId,
        centro_custo_id: a.centro_custo_id,
        valor: Number(a.valor),
      }));
    if (cabRows.length > 0) {
      const { error } = await (context.supabase as any).from("nfe_centro_custo").insert(cabRows);
      if (error) throw new Error(error.message);
    }
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true };
  });

async function recalcularECommitCabecalho(context: any, documentId: string) {
  const { data: itens } = await context.supabase
    .from("fiscal_document_items")
    .select("id, valor_bruto")
    .eq("document_id", documentId);
  const ids = (itens ?? []).map((i: any) => i.id);
  const { data: allocs } = ids.length
    ? await context.supabase
        .from("nfe_item_centro_custo")
        .select("document_item_id, centro_custo_id, valor")
        .in("document_item_id", ids)
    : { data: [] as any[] };
  const byItem = new Map<string, any[]>();
  for (const it of itens ?? []) byItem.set(it.id, []);
  for (const a of allocs ?? []) byItem.get(a.document_item_id)?.push(a);
  const itensPuros = (itens ?? []).map((i: any) => ({
    id: i.id,
    valor_bruto: Number(i.valor_bruto || 0),
    alocacoes: (byItem.get(i.id) ?? []).map((a: any) => ({
      centro_custo_id: a.centro_custo_id,
      valor: Number(a.valor),
    })),
  }));
  const consolidado = recalcularAlocacaoCabecalho(itensPuros);
  await context.supabase.from("nfe_centro_custo").delete().eq("document_id", documentId);
  if (consolidado.length > 0) {
    await context.supabase.from("nfe_centro_custo").insert(
      consolidado.map((c) => ({
        document_id: documentId,
        centro_custo_id: c.centro_custo_id,
        valor: c.valor,
      })),
    );
  }
}

// ---------- Tipo de Compra (NF-e) ----------

export const setTipoCompraCabecalho = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { documentId: string; tipoCompraId: string | null; sobrescreverItens: boolean }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertEditavel(context, data.documentId);
    const { error } = await (context.supabase as any)
      .from("fiscal_documents")
      .update({ tipo_compra_id: data.tipoCompraId })
      .eq("id", data.documentId);
    if (error) throw new Error(error.message);

    // Propaga para os itens (exceto os alterados manualmente, salvo sobrescrita explícita)
    let itemsQ = (context.supabase as any)
      .from("fiscal_document_items")
      .update({
        tipo_compra_id: data.tipoCompraId,
        tipo_compra_alterado_manualmente: false,
        apontado_por: context.userId,
        apontado_em: new Date().toISOString(),
      })
      .eq("document_id", data.documentId);
    if (!data.sobrescreverItens) {
      itemsQ = itemsQ.eq("tipo_compra_alterado_manualmente", false);
    }
    const { error: e2 } = await itemsQ;
    if (e2) throw new Error(e2.message);
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true };
  });

export const setTipoCompraItem = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; tipoCompraId: string | null }) => data)
  .handler(async ({ data, context }) => {
    const docId = await documentIdFromItem(context, data.itemId);
    await assertEditavel(context, docId);
    const { error } = await (context.supabase as any)
      .from("fiscal_document_items")
      .update({
        tipo_compra_id: data.tipoCompraId,
        tipo_compra_alterado_manualmente: true,
        apontado_por: context.userId,
        apontado_em: new Date().toISOString(),
      })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    await reavaliarApontamentos(context, docId);
    return { ok: true };
  });

/** Remove a flag manual do item e reaplica o Tipo de Compra do cabeçalho. */
export const restaurarTipoCompraItem = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string }) => data)
  .handler(async ({ data, context }) => {
    const docId = await documentIdFromItem(context, data.itemId);
    await assertEditavel(context, docId);
    const { data: doc } = await (context.supabase as any)
      .from("fiscal_documents")
      .select("tipo_compra_id")
      .eq("id", docId)
      .maybeSingle();
    const { error } = await (context.supabase as any)
      .from("fiscal_document_items")
      .update({
        tipo_compra_id: doc?.tipo_compra_id ?? null,
        tipo_compra_alterado_manualmente: false,
        apontado_por: context.userId,
        apontado_em: new Date().toISOString(),
      })
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    await reavaliarApontamentos(context, docId);
    return { ok: true };
  });

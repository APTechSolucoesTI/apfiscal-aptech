import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { distribuirCabecalhoParaItens, recalcularAlocacaoCabecalho, type CentroCustoAlocacao } from "./nfe-alocacao";
import { reavaliarApontamentos } from "./nfe-status.functions";
import { podeEditarApontamentos } from "./nfe-status";

async function assertEditavel(context: any, documentId: string) {
  const { data: doc } = await (context.supabase as any)
    .from("fiscal_documents").select("status").eq("id", documentId).maybeSingle();
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
    .from("fiscal_document_items").select("document_id").eq("id", itemId).maybeSingle();
  if (!data) throw new Error("Item não encontrado");
  return data.document_id as string;
}

// ---------- Plano de Contas (NF-e) ----------

export const setPlanoContasCabecalho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; planoContasId: string | null; sobrescreverItens: boolean }) => data)
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
      .update({ plano_contas_id: data.planoContasId, plano_contas_alterado_manualmente: false } as any)
      .eq("document_id", data.documentId);
    if (!data.sobrescreverItens) {
      itemsQ = itemsQ.eq("plano_contas_alterado_manualmente", false as any);
    }
    const { error: e2 } = await itemsQ;
    if (e2) throw new Error(e2.message);
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true };
  });

export const setPlanoContasItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; planoContasId: string | null }) => data)
  .handler(async ({ data, context }) => {
    const docId = await documentIdFromItem(context, data.itemId);
    await assertEditavel(context, docId);
    const { error } = await context.supabase
      .from("fiscal_document_items")
      .update({ plano_contas_id: data.planoContasId, plano_contas_alterado_manualmente: true } as any)
      .eq("id", data.itemId);
    if (error) throw new Error(error.message);
    await reavaliarApontamentos(context, docId);
    return { ok: true };
  });

// ---------- Local de Estoque (NF-e) ----------

export const setLocalEstoqueCabecalho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; localEstoqueId: string | null; sobrescreverItens: boolean }) => data)
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

export const setLocalEstoqueItem = createServerFn({ method: "POST" })
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

export const getAlocacaoNfe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string }) => data)
  .handler(async ({ data, context }) => {
    const [{ data: cab }, { data: itens }] = await Promise.all([
      (context.supabase as any).from("nfe_centro_custo").select("id, centro_custo_id, valor").eq("document_id", data.documentId),
      (context.supabase as any).from("nfe_item_centro_custo").select("id, document_item_id, centro_custo_id, valor")
        .in("document_item_id",
          ((await (context.supabase as any).from("fiscal_document_items").select("id").eq("document_id", data.documentId)).data ?? [])
            .map((r: any) => r.id) as any,
        ),
    ]);
    return { cabecalho: (cab ?? []) as any[], itens: (itens ?? []) as any[] };
  });

export const setAlocacoesItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { itemId: string; alocacoes: CentroCustoAlocacao[] }) => data)
  .handler(async ({ data, context }) => {
    // Valida limite (frontend também valida, mas garantimos no server)
    const { data: item } = await (context.supabase as any)
      .from("fiscal_document_items").select("id, document_id, valor_bruto").eq("id", data.itemId).maybeSingle();
    if (!item) throw new Error("Item não encontrado");
    await assertEditavel(context, item.document_id);
    const soma = data.alocacoes.reduce((s, a) => s + Number(a.valor || 0), 0);
    if (soma > Number(item.valor_bruto || 0) + 0.005) {
      throw new Error(`Soma dos centros de custo (R$ ${soma.toFixed(2)}) excede o valor do item (R$ ${Number(item.valor_bruto).toFixed(2)})`);
    }
    // Substitui: apaga e reinsere
    await (context.supabase as any).from("nfe_item_centro_custo").delete().eq("document_item_id", data.itemId);
    if (data.alocacoes.length > 0) {
      const rows = data.alocacoes
        .filter((a) => Number(a.valor) > 0)
        .map((a) => ({ document_item_id: data.itemId, centro_custo_id: a.centro_custo_id, valor: Number(a.valor) }));
      if (rows.length > 0) {
        const { error } = await (context.supabase as any).from("nfe_item_centro_custo").insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    // Recalcula cabeçalho consolidado
    await recalcularECommitCabecalho(context, item.document_id);
    await reavaliarApontamentos(context, item.document_id);
    return { ok: true };
  });

export const setAlocacoesCabecalho = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { documentId: string; alocacoes: CentroCustoAlocacao[]; propagarParaItens: boolean }) => data)
  .handler(async ({ data, context }) => {
    await assertEditavel(context, data.documentId);
    const { data: doc } = await (context.supabase as any)
      .from("fiscal_documents").select("id, valor_total").eq("id", data.documentId).maybeSingle();
    if (!doc) throw new Error("NF-e não encontrada");
    const soma = data.alocacoes.reduce((s, a) => s + Number(a.valor || 0), 0);
    if (soma > Number(doc.valor_total || 0) + 0.005) {
      throw new Error(`Soma (R$ ${soma.toFixed(2)}) excede o valor total da NF-e (R$ ${Number(doc.valor_total).toFixed(2)})`);
    }
    if (data.propagarParaItens) {
      const { data: itens } = await (context.supabase as any)
        .from("fiscal_document_items").select("id, valor_bruto").eq("document_id", data.documentId);
      const distribuicao = distribuirCabecalhoParaItens(data.alocacoes, (itens ?? []).map((i: any) => ({ id: i.id, valor_bruto: Number(i.valor_bruto || 0) })));
      // Apaga tudo dos itens
      const ids = (itens ?? []).map((i: any) => i.id);
      if (ids.length > 0) {
        await (context.supabase as any).from("nfe_item_centro_custo").delete().in("document_item_id", ids);
      }
      const rows: any[] = [];
      for (const [itemId, allocs] of Object.entries(distribuicao)) {
        for (const a of allocs) rows.push({ document_item_id: itemId, centro_custo_id: a.centro_custo_id, valor: a.valor });
      }
      if (rows.length > 0) {
        const { error } = await (context.supabase as any).from("nfe_item_centro_custo").insert(rows);
        if (error) throw new Error(error.message);
      }
    }
    // Grava cabeçalho: apaga e reinsere
    await (context.supabase as any).from("nfe_centro_custo").delete().eq("document_id", data.documentId);
    const cabRows = data.alocacoes
      .filter((a) => Number(a.valor) > 0)
      .map((a) => ({ document_id: data.documentId, centro_custo_id: a.centro_custo_id, valor: Number(a.valor) }));
    if (cabRows.length > 0) {
      const { error } = await (context.supabase as any).from("nfe_centro_custo").insert(cabRows);
      if (error) throw new Error(error.message);
    }
    await reavaliarApontamentos(context, data.documentId);
    return { ok: true };
  });

async function recalcularECommitCabecalho(context: any, documentId: string) {
  const { data: itens } = await context.supabase
    .from("fiscal_document_items").select("id, valor_bruto").eq("document_id", documentId);
  const ids = (itens ?? []).map((i: any) => i.id);
  const { data: allocs } = ids.length
    ? await context.supabase.from("nfe_item_centro_custo").select("document_item_id, centro_custo_id, valor").in("document_item_id", ids)
    : { data: [] as any[] };
  const byItem = new Map<string, any[]>();
  for (const it of (itens ?? [])) byItem.set(it.id, []);
  for (const a of allocs ?? []) byItem.get(a.document_item_id)?.push(a);
  const itensPuros = (itens ?? []).map((i: any) => ({
    id: i.id,
    valor_bruto: Number(i.valor_bruto || 0),
    alocacoes: (byItem.get(i.id) ?? []).map((a: any) => ({ centro_custo_id: a.centro_custo_id, valor: Number(a.valor) })),
  }));
  const consolidado = recalcularAlocacaoCabecalho(itensPuros);
  await context.supabase.from("nfe_centro_custo").delete().eq("document_id", documentId);
  if (consolidado.length > 0) {
    await context.supabase.from("nfe_centro_custo").insert(
      consolidado.map((c) => ({ document_id: documentId, centro_custo_id: c.centro_custo_id, valor: c.valor })),
    );
  }
}

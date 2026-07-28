import { podeVincularProduto, motivoBloqueioVinculo } from "./nfe-status";

/** Garante que a NF-e permite alterar vínculos de itens (aprovada / pronta p/ integração). */
export async function assertVinculoPermitidoPorDocumento(supabase: any, documentId: string) {
  const { data: doc } = await supabase
    .from("fiscal_documents")
    .select("status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new Error("NF-e não encontrada");
  if (!podeVincularProduto(doc.status)) throw new Error(motivoBloqueioVinculo(doc.status));
}

export async function assertVinculoPermitidoPorItem(supabase: any, itemId: string) {
  const { data: item } = await supabase
    .from("fiscal_document_items")
    .select("document_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) throw new Error("Item não encontrado");
  await assertVinculoPermitidoPorDocumento(supabase, item.document_id as string);
}

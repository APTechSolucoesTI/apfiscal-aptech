import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNenhumaIntegrada } from "./nfe-vinculo-guard";

export const deleteFiscalDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data, context }) => {
    if (!data.ids?.length) return { ok: true, count: 0 };
    await assertNenhumaIntegrada(context.supabase, data.ids);
    const { error, count } = await context.supabase
      .from("fiscal_documents").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? data.ids.length };
  });

export const getNfeDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("fiscal_documents")
      .select("*, companies(razao_social, nome_fantasia, cnpj)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return null;

    const { data: items } = await context.supabase
      .from("fiscal_document_items")
      .select("*")
      .eq("document_id", data.id)
      .order("numero_item", { ascending: true });

    const { data: events } = await context.supabase
      .from("fiscal_document_events")
      .select("*")
      .eq("document_id", data.id)
      .order("data_evento", { ascending: true });

    return { document: doc, items: items ?? [], events: events ?? [] };
  });

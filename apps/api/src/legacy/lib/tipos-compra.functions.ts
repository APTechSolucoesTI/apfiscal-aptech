import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TipoCompra } from "./nfe-tipo-compra";

/** Lista de domínio fixo (global, somente leitura). */
export const listTiposCompra = createApiAction({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("tipos_compra")
      .select("id, codigo, descricao, ativo")
      .eq("ativo", true)
      .order("codigo", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TipoCompra[];
  });

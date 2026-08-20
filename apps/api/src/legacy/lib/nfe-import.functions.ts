import { createApiAction } from "@/common/action-builder";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const importNfeXml = createApiAction({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { fileName: string; xml: string }) => {
    if (!input?.xml) throw new Error("Conteúdo XML é obrigatório.");
    if (!input?.fileName) throw new Error("Nome do arquivo é obrigatório.");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { importarNfeXml } = await import("./nfe-import.server");
    return importarNfeXml(context.supabase, data);
  });

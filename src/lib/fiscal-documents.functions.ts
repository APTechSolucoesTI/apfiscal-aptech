import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteFiscalDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data, context }) => {
    if (!data.ids?.length) return { ok: true, count: 0 };
    const { error, count } = await context.supabase
      .from("fiscal_documents").delete({ count: "exact" }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: count ?? data.ids.length };
  });

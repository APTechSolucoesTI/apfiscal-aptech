import { Controller, Get } from "@nestjs/common";
import { Public } from "@/common/public.decorator";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

@Public()
@Controller("public/plans")
export class PublicPlansController {
  @Get()
  async list() {
    const result = await supabaseAdmin
      .from("subscription_plans")
      .select(
        "key, name, description, price_label, highlighted, max_users, max_companies, max_monthly_documents, max_totvs_connections, features, sort_order",
      )
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (result.error) throw result.error;
    return { plans: result.data ?? [] };
  }
}

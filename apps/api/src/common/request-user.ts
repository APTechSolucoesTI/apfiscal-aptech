import type { User } from "@supabase/supabase-js";
import type { Request } from "express";
import type { AppSupabaseClient } from "@/integrations/supabase/client.server";

export type AuthenticatedRequest = Request & {
  accessToken: string;
  user: User;
  supabase: AppSupabaseClient;
};

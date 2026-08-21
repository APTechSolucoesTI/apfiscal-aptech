import type { Request } from "express";
import type { AppSupabaseClient } from "@/integrations/supabase/client.server";
import type { AppUser } from "@/auth/session-token";

export type AuthenticatedRequest = Request & {
  sessionId: string;
  user: AppUser;
  supabase: AppSupabaseClient;
};

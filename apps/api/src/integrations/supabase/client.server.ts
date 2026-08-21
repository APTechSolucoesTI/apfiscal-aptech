import { createClient } from "@supabase/supabase-js";
import { env, supabaseSecret } from "@/config/env";
import { createSupabaseRlsToken, type AppUser } from "@/auth/session-token";

export const supabaseAdmin = createClient(env("SUPABASE_URL"), supabaseSecret(), {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "apfiscal" },
});

export function createUserSupabase(user: AppUser) {
  const accessToken = createSupabaseRlsToken(user);
  return createClient(env("SUPABASE_URL"), env("SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "apfiscal" },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export type AppSupabaseClient = ReturnType<typeof createUserSupabase>;

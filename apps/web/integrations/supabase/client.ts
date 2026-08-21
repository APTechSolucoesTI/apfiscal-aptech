"use client";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY são obrigatórias.");
}

const proxyFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : null;
  const originalUrl = new URL(request?.url ?? String(input));
  if (originalUrl.pathname.startsWith("/auth/v1/")) return fetch(input, init);
  if (!originalUrl.pathname.startsWith("/rest/v1/") && !originalUrl.pathname.startsWith("/storage/v1/")) return fetch(input, init);
  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  const method = init?.method ?? request?.method ?? "GET";
  const body = ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : init?.body ?? (request ? await request.clone().arrayBuffer() : undefined);
  return fetch(`/backend/data-proxy?target=${encodeURIComponent(originalUrl.pathname + originalUrl.search)}`, {
    method,
    headers,
    body,
    credentials: "same-origin",
  });
};

// O browser nunca autentica no Supabase. As chamadas REST passam pelo backend,
// que valida o cookie de sessão do APFiscal e emite um JWT RLS de curta duração.
export const supabase = createClient(url, key, {
  db: { schema: "apfiscal" },
  global: { fetch: proxyFetch },
}) as unknown as SupabaseClient<Database>;

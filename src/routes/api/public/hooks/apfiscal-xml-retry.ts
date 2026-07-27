import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/apfiscal-xml-retry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!expected || provided !== expected) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { processarFilaXmlCompleto } = await import("@/lib/apfiscal/sync.server");
          const resumo = await processarFilaXmlCompleto();
          return Response.json({ ok: true, ...resumo });
        } catch (e) {
          console.error("[apfiscal-xml-retry]", e);
          return new Response(JSON.stringify({ ok: false }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});

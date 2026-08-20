"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <section className="mx-auto mt-20 max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold">Não foi possível carregar esta página</h1><p className="mt-2 text-sm text-slate-600">Verifique sua conexão e tente novamente. Seus dados não foram alterados.</p><Button className="mt-6" onClick={reset}>Tentar novamente</Button></section>;
}

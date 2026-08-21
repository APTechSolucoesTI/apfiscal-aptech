"use client";

import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { backendFetch } from "@/lib/backend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyEmailPage() {
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  useEffect(() => { const token = new URLSearchParams(window.location.search).get("token"); if (!token) { setState("error"); return; } void backendFetch("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }).then(() => setState("done")).catch(() => setState("error")); }, []);
  const copy = state === "loading" ? ["Confirmando e-mail", "Estamos validando seu acesso…"] : state === "done" ? ["E-mail confirmado", "Sua conta APFiscal está pronta para uso."] : ["Link inválido ou expirado", "Solicite um novo link de confirmação pelo suporte."];
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>{copy[0]}</CardTitle><CardDescription>{copy[1]}</CardDescription></CardHeader>{state !== "loading" && <CardContent><Link to="/login" className="text-sm font-medium text-blue-700 hover:underline">Ir para o login</Link></CardContent>}</Card></main>;
}

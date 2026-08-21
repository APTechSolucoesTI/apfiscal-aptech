"use client";

import { useState } from "react";
import { Link } from "@/lib/router-compat";
import { backendFetch } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true);
    try { await backendFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }); toast.success("Se existir uma conta APFiscal com este e-mail, enviaremos as instruções."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível solicitar a redefinição."); }
    finally { setLoading(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>Redefinir senha</CardTitle><CardDescription>Informe seu e-mail APFiscal para receber um link seguro.</CardDescription></CardHeader><form onSubmit={submit}><CardContent><Label htmlFor="email">E-mail</Label><Input className="mt-2" id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></CardContent><CardFooter className="mt-4 flex flex-col gap-4"><Button className="w-full" disabled={loading}>{loading ? "Enviando…" : "Enviar link"}</Button><Link to="/login" className="text-sm text-blue-700 hover:underline">Voltar para o login</Link></CardFooter></form></Card></main>;
}

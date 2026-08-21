"use client";

import { useState } from "react";
import { useNavigate, Link } from "@/lib/router-compat";
import { backendFetch } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ActivatePage() { return <PasswordTokenForm endpoint="/auth/activate" title="Ative seu acesso" description="Defina uma senha forte para concluir seu convite." />; }
export function PasswordTokenForm({ endpoint, title, description }: { endpoint: "/auth/activate" | "/auth/reset-password"; title: string; description: string }) {
  const [password, setPassword] = useState(""); const [loading, setLoading] = useState(false); const navigate = useNavigate();
  async function submit(event: React.FormEvent) { event.preventDefault(); const token = new URLSearchParams(window.location.search).get("token"); if (!token) { toast.error("Link inválido."); return; } setLoading(true); try { await backendFetch(endpoint, { method: "POST", body: JSON.stringify({ token, password }) }); toast.success("Senha salva. Agora você pode entrar."); navigate({ to: "/login" }); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível concluir a operação."); } finally { setLoading(false); } }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><form onSubmit={submit}><CardContent><Label htmlFor="password">Nova senha</Label><Input className="mt-2" id="password" type="password" minLength={12} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><p className="mt-2 text-xs text-slate-500">Use pelo menos 12 caracteres.</p></CardContent><CardFooter className="mt-4 flex flex-col gap-4"><Button className="w-full" disabled={loading}>{loading ? "Salvando…" : "Salvar senha"}</Button><Link to="/login" className="text-sm text-blue-700 hover:underline">Voltar para o login</Link></CardFooter></form></Card></main>;
}

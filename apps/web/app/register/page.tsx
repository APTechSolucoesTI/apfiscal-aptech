"use client";

import { useNavigate, Link } from "@/lib/router-compat";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { backendFetch } from "@/lib/backend";
import { toast } from "sonner";
import { UserPlus, ArrowRight } from "lucide-react";

function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await backendFetch("/auth/register", { method: "POST", body: JSON.stringify({ fullName, email, password }) });
      toast.success("Conta criada. Confirme seu e-mail para liberar o acesso.");
      navigate({ to: "/login" });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erro ao realizar cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-xl bg-white">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-2xl">
              AP
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Começar 7 Dias Grátis</CardTitle>
          <CardDescription>
            Crie sua conta agora e tenha acesso total por uma semana
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input 
                id="fullName" 
                placeholder="Seu nome" 
                required 
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail Corporativo</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="nome@empresa.com" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="Mínimo 12 caracteres"
                minLength={12}
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-50 border-slate-200"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button 
              type="submit" 
              className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-white font-bold" 
              disabled={loading}
            >
              {loading ? "Criando conta..." : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" /> Iniciar Teste Gratuito
                </>
              )}
            </Button>
            <div className="text-center text-sm text-slate-500">
              Já tem uma conta?{" "}
              <Link to="/login" className="text-blue-600 font-medium hover:underline">
                Fazer login
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default Register;

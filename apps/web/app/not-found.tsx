import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main className="grid min-h-dvh place-items-center bg-slate-50 p-6"><section className="max-w-md text-center"><p className="text-sm font-semibold text-blue-700">Erro 404</p><h1 className="mt-2 text-3xl font-bold">Página não encontrada</h1><p className="mt-3 text-slate-600">O endereço pode ter mudado ou você não possui acesso a esta área.</p><Button asChild className="mt-6"><Link href="/dashboard">Voltar ao dashboard</Link></Button></section></main>;
}

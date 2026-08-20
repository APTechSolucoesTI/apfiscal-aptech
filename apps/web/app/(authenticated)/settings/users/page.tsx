"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, Pencil, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { backendFetch } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type Member = { user_id: string; profile_id: string | null; active: boolean; user: { email: string; full_name: string | null; active: boolean } | null; profile_name: string | null; company_ids: string[] };
type Payload = { users: Member[]; profiles: Array<{ id: string; name: string }>; companies: Array<{ id: string; razao_social: string; nome_fantasia: string | null }> };
type FormState = { id?: string; fullName: string; email: string; profileId: string; companyIds: string[]; active: boolean };

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const query = useQuery({ queryKey: ["organization-users"], queryFn: () => backendFetch<Payload>("/users") });
  const save = useMutation({
    mutationFn: (values: FormState) => backendFetch(values.id ? `/users/${values.id}` : "/users/invite", { method: values.id ? "PATCH" : "POST", body: JSON.stringify(values) }),
    onSuccess: async (_, values) => { await queryClient.invalidateQueries({ queryKey: ["organization-users"] }); setForm(null); toast.success(values.id ? "Usuário atualizado." : "Convite enviado com segurança."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const openEdit = (member: Member) => setForm({ id: member.user_id, fullName: member.user?.full_name ?? "", email: member.user?.email ?? "", profileId: member.profile_id ?? "", companyIds: member.company_ids, active: member.active });

  return <div className="space-y-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-blue-700">Equipe</p><h1 className="text-2xl font-bold">Usuários</h1><p className="mt-1 text-sm text-slate-500">Convide pessoas, associe perfis e limite as empresas acessíveis.</p></div><Button onClick={() => setForm({ fullName: "", email: "", profileId: query.data?.profiles[0]?.id ?? "", companyIds: [], active: true })}><MailPlus className="mr-2 h-4 w-4" />Convidar usuário</Button></header>
    <Card className="overflow-hidden border-slate-200"><CardContent className="p-0">{query.isLoading ? <div className="py-14 text-center text-sm text-slate-500">Carregando equipe…</div> : query.isError ? <div className="py-14 text-center text-sm text-red-700">Não foi possível carregar os usuários.</div> : (query.data?.users.length ?? 0) === 0 ? <div className="flex flex-col items-center py-16 text-center"><Users className="h-10 w-10 text-slate-300" /><h2 className="mt-3 font-semibold">Sua equipe aparecerá aqui</h2><p className="mt-1 text-sm text-slate-500">Envie o primeiro convite para começar.</p></div> : <div className="divide-y divide-slate-100">{query.data?.users.map((member) => <div key={member.user_id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700"><UserRound className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-medium">{member.user?.full_name || "Nome pendente"}</p><p className="truncate text-sm text-slate-500">{member.user?.email}</p></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{member.profile_name || "Sem perfil"}</Badge><Badge variant={member.active ? "default" : "secondary"}>{member.active ? "Ativo" : "Inativo"}</Badge><span className="text-xs text-slate-500">{member.company_ids.length ? `${member.company_ids.length} empresa(s)` : "Todas as empresas"}</span><Button size="icon" variant="ghost" aria-label="Editar usuário" onClick={() => openEdit(member)}><Pencil className="h-4 w-4" /></Button></div></div>)}</div>}</CardContent></Card>
    <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{form?.id ? "Editar usuário" : "Convidar usuário"}</DialogTitle><DialogDescription>O convite é criado exclusivamente pela API; nenhuma chave administrativa vai para o navegador.</DialogDescription></DialogHeader>{form && <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="member-name">Nome</Label><Input id="member-name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></div><div className="space-y-2"><Label htmlFor="member-email">E-mail</Label><Input id="member-email" type="email" disabled={Boolean(form.id)} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div><div className="space-y-2 sm:col-span-2"><Label>Perfil</Label><Select value={form.profileId} onValueChange={(profileId) => setForm({ ...form, profileId })}><SelectTrigger><SelectValue placeholder="Selecione um perfil" /></SelectTrigger><SelectContent>{query.data?.profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>)}</SelectContent></Select></div></div><div><Label>Empresas acessíveis</Label><p className="mb-3 text-xs text-slate-500">Nenhuma seleção significa acesso a todas as empresas da organização.</p><div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">{query.data?.companies.map((company) => <label key={company.id} className="flex cursor-pointer items-center gap-3 text-sm"><Checkbox checked={form.companyIds.includes(company.id)} onCheckedChange={(checked) => setForm({ ...form, companyIds: checked ? [...form.companyIds, company.id] : form.companyIds.filter((id) => id !== company.id) })} />{company.nome_fantasia || company.razao_social}</label>)}</div></div>{form.id && <div className="flex items-center gap-3"><Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} /><Label>Usuário ativo</Label></div>}</div>}<DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={!form?.fullName || !form?.email || !form?.profileId || save.isPending} onClick={() => form && save.mutate(form)}>{save.isPending ? "Salvando…" : form?.id ? "Salvar alterações" : "Enviar convite"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

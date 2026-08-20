"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LockKeyhole, Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { backendFetch } from "@/lib/backend";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Permission = { key: string; module: string; action: string; description: string };
type Profile = { id: string; name: string; description: string | null; active: boolean; is_system: boolean; profile_permissions: Array<{ permission_key: string }> };
type ProfilesPayload = { profiles: Profile[]; permissions: Permission[] };
type FormState = { id?: string; name: string; description: string; active: boolean; permissionKeys: string[]; isSystem?: boolean };
const emptyForm: FormState = { name: "", description: "", active: true, permissionKeys: [] };

export default function AccessProfilesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const query = useQuery({ queryKey: ["access-profiles"], queryFn: () => backendFetch<ProfilesPayload>("/access-profiles") });
  const grouped = useMemo(() => Object.groupBy(query.data?.permissions ?? [], (permission) => permission.module), [query.data]);
  const save = useMutation({
    mutationFn: (values: FormState) => backendFetch(values.id ? `/access-profiles/${values.id}` : "/access-profiles", {
      method: values.id ? "PATCH" : "POST",
      body: JSON.stringify({ name: values.name, description: values.description || null, active: values.active, permissionKeys: values.permissionKeys }),
    }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["access-profiles"] }); setForm(null); toast.success("Perfil salvo com sucesso."); },
    onError: (error: Error) => toast.error(error.message),
  });
  const duplicate = useMutation({
    mutationFn: (id: string) => backendFetch(`/access-profiles/${id}/duplicate`, { method: "POST" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["access-profiles"] }); toast.success("Perfil duplicado."); },
    onError: (error: Error) => toast.error(error.message),
  });

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-medium text-blue-700">Segurança e acesso</p><h1 className="text-2xl font-bold text-slate-950">Perfis de Acesso</h1><p className="mt-1 text-sm text-slate-500">Controle telas e ações disponíveis para cada função da equipe.</p></div>
      <Button onClick={() => setForm(emptyForm)}><Plus className="mr-2 h-4 w-4" />Novo perfil</Button>
    </header>
    {query.isLoading ? <Card><CardContent className="py-12 text-center text-sm text-slate-500">Carregando perfis…</CardContent></Card> : query.isError ? <Card className="border-red-200"><CardContent className="py-10 text-center text-sm text-red-700">Não foi possível carregar os perfis.</CardContent></Card> : (query.data?.profiles.length ?? 0) === 0 ? <Card><CardContent className="flex flex-col items-center py-14 text-center"><ShieldCheck className="h-10 w-10 text-slate-300" /><h2 className="mt-3 font-semibold">Nenhum perfil cadastrado</h2><p className="mt-1 text-sm text-slate-500">Crie o primeiro perfil para distribuir permissões.</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">
      {query.data?.profiles.map((profile) => <Card key={profile.id} className="border-slate-200 shadow-sm"><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="flex items-center gap-2 text-base">{profile.is_system && <LockKeyhole className="h-4 w-4 text-blue-600" />}{profile.name}</CardTitle><CardDescription className="mt-1 line-clamp-2">{profile.description || "Sem descrição"}</CardDescription></div><Badge variant={profile.active ? "default" : "secondary"}>{profile.active ? "Ativo" : "Inativo"}</Badge></div></CardHeader><CardContent><p className="text-sm text-slate-600">{profile.profile_permissions.length} permissões atribuídas</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={profile.is_system} onClick={() => setForm({ id: profile.id, name: profile.name, description: profile.description ?? "", active: profile.active, permissionKeys: profile.profile_permissions.map((item) => item.permission_key), isSystem: profile.is_system })}><Pencil className="mr-2 h-3.5 w-3.5" />Editar</Button><Button size="sm" variant="ghost" onClick={() => duplicate.mutate(profile.id)}><Copy className="mr-2 h-3.5 w-3.5" />Duplicar</Button></div></CardContent></Card>)}
    </div>}
    <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{form?.id ? "Editar perfil" : "Novo perfil"}</DialogTitle><DialogDescription>As permissões são aplicadas no menu e validadas novamente pela API.</DialogDescription></DialogHeader>{form && <div className="space-y-6"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="profile-name">Nome</Label><Input id="profile-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className="flex items-end gap-3 pb-2"><Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} /><Label>Perfil ativo</Label></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="profile-description">Descrição</Label><Textarea id="profile-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div></div><div className="space-y-4"><div><h3 className="font-semibold">Permissões</h3><p className="text-sm text-slate-500">Selecione apenas o necessário para esta função.</p></div>{Object.entries(grouped).map(([module, permissions]) => <section key={module} className="rounded-lg border border-slate-200 p-4"><h4 className="mb-3 text-sm font-semibold text-slate-900">{module}</h4><div className="grid gap-3 sm:grid-cols-2">{permissions?.map((permission) => { const checked = form.permissionKeys.includes(permission.key); return <label key={permission.key} className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-slate-50"><Checkbox checked={checked} onCheckedChange={(value) => setForm({ ...form, permissionKeys: value ? [...form.permissionKeys, permission.key] : form.permissionKeys.filter((key) => key !== permission.key) })} /><span><span className="block text-sm font-medium">{permission.description}</span><span className="text-xs text-slate-400">{permission.key}</span></span></label>; })}</div></section>)}</div></div>}<DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button><Button disabled={!form?.name.trim() || save.isPending} onClick={() => form && save.mutate(form)}>{save.isPending ? "Salvando…" : "Salvar perfil"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

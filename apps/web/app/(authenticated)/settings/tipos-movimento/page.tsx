"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useServerFn } from "@/lib/api-action";
import { listTiposMovimento, setTipoMovimentoDocumento } from "@/lib/client-actions";
import { supabase } from "@/integrations/supabase/client";

type Movement = {
  id: string;
  codigo: string;
  descricao: string;
  vinculado: boolean;
  tipos_documento: string[];
};

export default function TiposMovimentoPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listTiposMovimento);
  const save = useServerFn(setTipoMovimentoDocumento);
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const companies = useQuery({
    queryKey: ["companies-movement-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, razao_social, nome_fantasia")
        .order("razao_social");
      if (error) throw error;
      if (!companyId && data?.[0]) setCompanyId(data[0].id);
      return data ?? [];
    },
  });
  const movements = useQuery<Movement[]>({
    queryKey: ["tipos-movimento", companyId],
    queryFn: () => list({ data: { companyId } }),
    enabled: Boolean(companyId),
  });
  const update = useMutation({
    mutationFn: (input: { tipoMovimentoId: string; tipoDocumento: "nfe" | "nfse"; vinculado: boolean }) =>
      save({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tipos-movimento", companyId] }),
    onError: (error: Error) => toast.error(error.message),
  });
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (movements.data ?? []).filter((movement) =>
      `${movement.codigo} ${movement.descricao}`.toLowerCase().includes(normalized),
    );
  }, [movements.data, search]);

  const panel = (type: "nfe" | "nfse") => (
    <div className="space-y-2">
      {filtered.map((movement) => {
        const linked = movement.tipos_documento.includes(type);
        return (
          <div key={movement.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{movement.codigo}</span>
                {linked && <Badge variant="secondary">Disponível em {type.toUpperCase()}</Badge>}
              </div>
              <p className="truncate text-sm text-muted-foreground">{movement.descricao}</p>
            </div>
            <Switch
              checked={linked}
              disabled={update.isPending}
              aria-label={`Vincular ${movement.codigo} a ${type.toUpperCase()}`}
              onCheckedChange={(vinculado) =>
                update.mutate({ tipoMovimentoId: movement.id, tipoDocumento: type, vinculado })
              }
            />
          </div>
        );
      })}
      {!movements.isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum Tipo de Movimento encontrado. Execute uma sincronização TOTVS para carregar a TTMV.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ArrowRightLeft className="h-6 w-6" />Tipos de Movimento</h1>
        <p className="text-sm text-muted-foreground">Defina quais movimentos da TTMV podem ser usados em NF-e e NFS-e.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Vínculos por documento fiscal</CardTitle>
          <CardDescription>O usuário verá sempre o código e a descrição do movimento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Empresa</Label><Select value={companyId} onValueChange={setCompanyId}><SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger><SelectContent>{(companies.data ?? []).map((company) => <SelectItem key={company.id} value={company.id}>{company.nome_fantasia || company.razao_social}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Pesquisar</Label><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código ou descrição" className="pl-9" /></div></div>
          </div>
          {movements.isLoading ? <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando TTMV...</div> : <Tabs defaultValue="nfe"><TabsList><TabsTrigger value="nfe">NF-e</TabsTrigger><TabsTrigger value="nfse">NFS-e</TabsTrigger></TabsList><TabsContent value="nfe" className="mt-4">{panel("nfe")}</TabsContent><TabsContent value="nfse" className="mt-4">{panel("nfse")}</TabsContent></Tabs>}
        </CardContent>
      </Card>
    </div>
  );
}

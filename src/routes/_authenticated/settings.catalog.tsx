import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgSettings, updateCatalogScope, type CatalogScope } from "@/lib/organization.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Globe2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/_authenticated/settings/catalog")({
  component: CatalogSettingsPage,
  head: () => ({
    meta: [
      { title: "Cadastros Globais | APFiscal" },
      { name: "description", content: "Configure se fornecedores, produtos, plano de contas e centros de custo são compartilhados por todas as empresas ou vinculados a uma empresa específica." },
      { property: "og:title", content: "Cadastros Globais | APFiscal" },
      { property: "og:description", content: "Defina o escopo dos cadastros de fornecedores, produtos, plano de contas e centros de custo na sua organização." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function CatalogSettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrgSettings);
  const updateFn = useServerFn(updateCatalogScope);
  const { data, isLoading } = useQuery({ queryKey: ["org-settings"], queryFn: () => getFn() });
  const [scope, setScope] = useState<CatalogScope>("per_company");

  useEffect(() => { if (data?.catalog_scope) setScope(data.catalog_scope); }, [data?.catalog_scope]);

  const mut = useMutation({
    mutationFn: (v: CatalogScope) => updateFn({ data: { scope: v } }),
    onSuccess: () => {
      toast.success("Configuração de catálogo atualizada");
      qc.invalidateQueries({ queryKey: ["org-settings"] });
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["plano-contas"] });
      qc.invalidateQueries({ queryKey: ["centros-custo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cadastros Globais</h1>
        <p className="text-sm text-slate-500">Escolha se os cadastros de Fornecedores, Produtos (Famílias, Grupos e Subgrupos), Plano de Contas e Centros de Custo são compartilhados por todas as empresas da organização ou vinculados a uma empresa específica.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Escopo do Catálogo</CardTitle>
          <CardDescription>
            Essa configuração afeta como novos fornecedores e produtos são vinculados. Registros já cadastrados continuam com o vínculo original.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
          ) : (
            <>
              <RadioGroup value={scope} onValueChange={(v) => setScope(v as CatalogScope)} className="gap-3">
                <label htmlFor="scope-global" className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-slate-50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                  <RadioGroupItem id="scope-global" value="global" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Globe2 className="h-4 w-4 text-primary" /> Cadastro Global
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      Fornecedores e produtos ficam disponíveis para todas as empresas cadastradas no tenant. Ideal para grupos empresariais que compartilham catálogo.
                    </p>
                  </div>
                </label>
                <label htmlFor="scope-per-company" className="flex items-start gap-3 p-4 rounded-lg border cursor-pointer hover:bg-slate-50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                  <RadioGroupItem id="scope-per-company" value="per_company" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Building2 className="h-4 w-4 text-primary" /> Cadastro por Empresa
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      Cada fornecedor e produto é vinculado a uma empresa específica. O usuário deverá selecionar a empresa ao cadastrar.
                    </p>
                  </div>
                </label>
              </RadioGroup>

              <div className="flex justify-end">
                <Button
                  onClick={() => mut.mutate(scope)}
                  disabled={mut.isPending || scope === data?.catalog_scope}
                >
                  {mut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Salvar configuração
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

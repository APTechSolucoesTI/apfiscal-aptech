import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, KeyRound, PlugZap, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { carregarIntegracao, salvarIntegracao, testarConexao } from "@/services/apfiscalService";
import { CertificadoDigitalForm } from "./CertificadoDigitalForm";

type Props = { companyId: string | null; cnpj?: string | null };

const BASE_URL_PADRAO = "https://apifiscal.aptechinfo.com.br:90/rotas/";

export function IntegracaoFiscalForm({ companyId, cnpj }: Props) {
  const queryClient = useQueryClient();
  const [apiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(BASE_URL_PADRAO);
  const [ativo, setAtivo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["apfiscal-integracao", companyId],
    queryFn: () => carregarIntegracao(companyId!),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (data) {
      setAtivo(data.ativo);
      setBaseUrl(data.baseUrl?.trim() || BASE_URL_PADRAO);
    }
  }, [data]);

  if (!companyId) {
    return (
      <div className="rounded-md border border-dashed p-6 text-center text-sm text-slate-500">
        Salve a empresa primeiro para configurar a integração fiscal (NF-e).
      </div>
    );
  }

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      await salvarIntegracao({ companyId, apiKey: apiKey.trim() || null, ativo, baseUrl: BASE_URL_PADRAO });
      setBaseUrl(BASE_URL_PADRAO);
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-integracao", companyId] });
      toast.success("Integração fiscal atualizada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar integração.");
    } finally {
      setSalvando(false);
    }
  };

  const handleTestar = async () => {
    setTestando(true);
    try {
      const res = await testarConexao({
        companyId,
        apiKey: apiKey.trim() || null,
        baseUrl: baseUrl.trim() || null,
      });
      if (res.ok) toast.success(res.mensagem);
      else toast.error(res.mensagem);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao testar conexão.");
    } finally {
      setTestando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <PlugZap className="h-4 w-4 text-blue-600" />
        Integração Fiscal (NF-e)
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando configuração…
        </div>
      ) : (
        <>
          <CertificadoDigitalForm
            companyId={companyId}
            cnpj={cnpj ?? null}
            certificado={data?.certificado ?? null}
            integracaoAtiva={Boolean(data?.ativo)}
          />

          <div className="grid gap-2">
            <Label htmlFor="apfiscal-base-url">URL base da API (APFISCAL_BASE_URL)</Label>
            <Input
              id="apfiscal-base-url"
              type="url"
              readOnly
              disabled
              autoComplete="off"
              value={baseUrl}
              className="bg-slate-50 text-slate-600"
            />
            <p className="text-xs text-slate-500">
              Endereço padrão da API fiscal, definido pelo sistema e não editável.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apfiscal-key">Chave de API (APFISCAL_API_KEY)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="apfiscal-key"
                type="password"
                readOnly
                disabled
                autoComplete="off"
                placeholder={data?.configurada ? `••••••••${data.apiKeyLast4 ?? ""}` : "Configurada pelo administrador"}
                value=""
                className="bg-slate-50"
              />
              {data?.configurada && (
                <Badge variant="outline" className="whitespace-nowrap text-slate-600">
                  <ShieldCheck className="mr-1 h-3 w-3 text-green-600" />
                  ••••••••{data.apiKeyLast4}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              A chave é gerenciada pelo servidor, criptografada e não editável nesta tela.
            </p>
          </div>


          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium text-slate-900">Integração ativa</div>
              <p className="text-xs text-slate-500">
                Último NSU sincronizado: <span className="font-mono">{data?.ultimoNsu ?? 0}</span>
              </p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSalvar} disabled={salvando} className="bg-blue-600 hover:bg-blue-700">
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Salvar integração
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleTestar}
              disabled={testando || (!data?.configurada && !apiKey.trim())}
            >
              {testando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
              Testar conexão
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

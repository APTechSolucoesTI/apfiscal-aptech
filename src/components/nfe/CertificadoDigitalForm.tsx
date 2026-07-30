import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { enviarCertificado, type CertificadoResumo } from "@/services/apfiscalService";

const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  companyId: string;
  cnpj: string | null;
  certificado: CertificadoResumo | null;
  integracaoAtiva: boolean;
};

function dataBr(valor: string | null): string {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString("pt-BR");
}

export function CertificadoDigitalForm({ companyId, cnpj, certificado, integracaoAtiva }: Props) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [substituindo, setSubstituindo] = useState(false);

  const jaConfigurado = Boolean(certificado);
  const mostrarFormulario = !jaConfigurado || substituindo;

  const selecionar = (file: File | null) => {
    setErro(null);
    if (!file) return setArquivo(null);
    if (!/\.pfx$/i.test(file.name)) {
      setArquivo(null);
      setErro("Selecione um arquivo com extensão .pfx.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setArquivo(null);
      setErro("O certificado excede o limite de 5MB.");
      return;
    }
    setArquivo(file);
  };

  const limparSenha = () => {
    setSenha("");
  };

  const handleEnviar = async () => {
    if (!arquivo || !senha) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await enviarCertificado({ companyId, senha, arquivo });
      limparSenha();
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = "";
      setSubstituindo(false);
      await queryClient.invalidateQueries({ queryKey: ["apfiscal-integracao", companyId] });
      toast.success(res.mensagem);
    } catch (e) {
      limparSenha();
      const msg = e instanceof Error ? e.message : "Falha ao enviar o certificado.";
      setErro(msg);
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  const dias = certificado?.diasRestantes ?? null;
  const vencido = certificado?.vencido === true || (dias != null && dias <= 0);
  const alerta = !vencido && dias != null && dias < 30;

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          Certificado Digital A1
        </div>
        {jaConfigurado &&
          (vencido ? (
            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Certificado vencido</Badge>
          ) : integracaoAtiva ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Integração ativa
            </Badge>
          ) : (
            <Badge variant="outline">Integração inativa</Badge>
          ))}
      </div>

      {jaConfigurado && certificado && (
        <div className="grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-3">
          <div>
            <div className="text-xs text-slate-500">Início da validade</div>
            <div className="text-sm font-medium">{dataBr(certificado.validadeInicio)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Fim da validade</div>
            <div className="text-sm font-medium">{dataBr(certificado.validadeFim)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Dias restantes</div>
            <div
              className={
                vencido ? "text-sm font-semibold text-red-600" : alerta ? "text-sm font-semibold text-amber-600" : "text-sm font-medium"
              }
            >
              {dias == null ? "—" : dias}
            </div>
          </div>
          {(vencido || alerta) && (
            <div className="sm:col-span-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              {vencido
                ? "O certificado está vencido. Envie um novo certificado A1 para reativar a integração."
                : "O certificado vence em menos de 30 dias. Providencie a renovação."}
            </div>
          )}
        </div>
      )}

      {!mostrarFormulario && (
        <Button type="button" variant="outline" onClick={() => setSubstituindo(true)}>
          <RefreshCw className="mr-2 h-4 w-4" /> Substituir certificado
        </Button>
      )}

      {mostrarFormulario && (
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>CNPJ da empresa</Label>
            <Input value={cnpj ?? ""} readOnly disabled className="bg-slate-50 text-slate-600" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cert-file">Arquivo do certificado (.pfx, até 5MB)</Label>
            <Input
              id="cert-file"
              ref={inputRef}
              type="file"
              accept=".pfx"
              onChange={(e) => selecionar(e.target.files?.[0] ?? null)}
            />
            {arquivo && (
              <p className="text-xs text-slate-500">
                {arquivo.name} · {(arquivo.size / 1024).toFixed(0)} KB
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cert-senha">Senha do certificado</Label>
            <Input
              id="cert-senha"
              type="password"
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Informe a senha do arquivo .pfx"
            />
            <p className="text-xs text-slate-500">
              A senha é usada apenas nesta transmissão segura e nunca é armazenada no APFiscal.
            </p>
          </div>

          {erro && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              {erro}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleEnviar}
              disabled={!arquivo || !senha || enviando}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              {enviando ? "Enviando certificado…" : "Enviar certificado"}
            </Button>
            {jaConfigurado && (
              <Button
                type="button"
                variant="ghost"
                disabled={enviando}
                onClick={() => {
                  setSubstituindo(false);
                  setArquivo(null);
                  limparSenha();
                  setErro(null);
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

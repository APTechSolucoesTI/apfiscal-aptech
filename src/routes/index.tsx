import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8 bg-slate-50 min-h-screen">
      <div className="space-y-8">
        <header className="text-center">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">APFiscal</h1>
          <p className="mt-4 text-lg text-slate-600">
            Plataforma de monitoramento automático de documentos fiscais eletrônicos
          </p>
        </header>

        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>1. Visão Geral do Produto</CardTitle>
            </CardHeader>
            <CardContent className="prose prose-slate max-w-none">
              <p>
                Construa um SaaS B2B chamado <strong>APFiscal</strong>, seguindo a mesma linha de naming do APChat (atendimento multicanal). 
                O APFiscal é uma plataforma de <strong>monitoramento automático de documentos fiscais eletrônicos</strong> (NF-e, NFS-e, CT-e) para empresas brasileiras. 
                O sistema atua como um "vigia fiscal" contínuo: identifica em tempo real qualquer nota emitida contra o CNPJ do cliente, armazena os arquivos com validade jurídica, permite ações de manifestação do destinatário e organiza tudo em dashboards financeiros/fiscais.
              </p>
              <p>
                Este produto faz parte da mesma suíte/portfólio do APChat — mantenha consistência de identidade visual (paleta de cores, tipografia, estilo de componentes) com essas outras duas plataformas, para reforçar a percepção de suíte integrada.
              </p>
              <p>
                <strong>Público-alvo:</strong> empresas de médio porte, escritórios de contabilidade que gerenciam múltiplos clientes, e grupos econômicos com várias filiais (multi-CNPJ).
              </p>

              <div className="mt-6">
                <h3 className="text-lg font-semibold">Stack esperada:</h3>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Frontend: React + TypeScript + Tailwind + shadcn/ui</li>
                  <li>Backend: Lovable Cloud (Postgres + Auth + Storage + Server Functions)</li>
                </ul>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Importante sobre integração real com a SEFAZ:</strong> a captura de NF-e será feita usando a biblioteca open-source <strong>NFeWizard-io</strong>.
                  A integração deve ser feita através de um microserviço Node.js dedicado que se comunica com o Supabase.
                </p>
              </div>
            </CardContent>
          </Card>

          <Separator />

          <Card>
            <CardHeader>
              <CardTitle>2. Módulos e Funcionalidades</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.1</Badge> Multi-tenant / Multi-CNPJ
                  </h3>
                  <p className="text-sm text-slate-600">Gestão de múltiplos CNPJs (filiais ou clientes) com permissões granulares por usuário.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.2</Badge> Gestão de Certificados
                  </h3>
                  <p className="text-sm text-slate-600">Cadastro de certificados A1 (.pfx) com alertas de expiração e armazenamento seguro.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.3</Badge> Captura e Listagem
                  </h3>
                  <p className="text-sm text-slate-600">Tabela unificada de NF-e, NFS-e e CT-e com filtros avançados e exportação.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.4</Badge> Manifesto do Destinatário
                  </h3>
                  <p className="text-sm text-slate-600">Ações de Ciência, Confirmação, Desconhecimento e Operação não Realizada.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.5</Badge> Guarda Legal (XML/PDF)
                  </h3>
                  <p className="text-sm text-slate-600">Armazenamento imutável por 5 anos com download individual ou em lote.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.6</Badge> Alertas e Notificações
                  </h3>
                  <p className="text-sm text-slate-600">Central de notificações in-app, e-mail e webhooks para eventos fiscais.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.7</Badge> Prevenção contra Fraude
                  </h3>
                  <p className="text-sm text-slate-600">Regras de risco configuráveis e fila de revisão para notas suspeitas.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.8</Badge> Dashboards e Relatórios
                  </h3>
                  <p className="text-sm text-slate-600">Visão financeira total, ranking de fornecedores e relatórios de fechamento mensal.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.9</Badge> API e Integrações
                  </h3>
                  <p className="text-sm text-slate-600">API Keys para desenvolvedores e webhooks outbound para ERPs.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

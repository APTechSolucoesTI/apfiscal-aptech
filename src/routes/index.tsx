import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowRight, LayoutDashboard } from "lucide-react";

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
          <div className="mt-8 flex justify-center gap-4">
            <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700">
              <Link to="/dashboard">
                <LayoutDashboard className="mr-2 h-5 w-5" /> Acessar Dashboard
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/login">
                Fazer Login <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
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
                <h3 className="text-lg font-semibold text-slate-800">Stack esperada (padrão Lovable):</h3>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-slate-600">
                  <li>Frontend: React + TypeScript + Tailwind + shadcn/ui</li>
                  <li>Backend: Supabase (Postgres + Auth + Storage + Edge Functions + Row Level Security)</li>
                  <li>Autenticação: Supabase Auth (email/senha + convite de equipe)</li>
                  <li>Armazenamento de arquivos: Supabase Storage (buckets separados por CNPJ/tenant)</li>
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
                  <p className="text-sm text-slate-600">Gestão de múltiplos CNPJs com permissões granulares e papéis de usuário (Admin, Financeiro, Visualizador).</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.2</Badge> Gestão de Certificados
                  </h3>
                  <p className="text-sm text-slate-600">Cadastro de certificados A1 (.pfx) com criptografia segura e alertas de expiração.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.3</Badge> Captura e Listagem
                  </h3>
                  <p className="text-sm text-slate-600">Tabela unificada de NF-e, NFS-e e CT-e com filtros avançados e exportação CSV/Excel.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.4</Badge> Manifesto do Destinatário
                  </h3>
                  <p className="text-sm text-slate-600">Ações de Ciência, Confirmação, Desconhecimento e Operação não Realizada com histórico.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.5</Badge> Guarda Legal (XML/PDF)
                  </h3>
                  <p className="text-sm text-slate-600">Armazenamento imutável por 5 anos com trilha de auditoria de acessos.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.6</Badge> Alertas e Notificações
                  </h3>
                  <p className="text-sm text-slate-600">Gatilhos configuráveis por e-mail, webhook e push para eventos críticos.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.7</Badge> Prevenção contra Fraude
                  </h3>
                  <p className="text-sm text-slate-600">Regras de risco para identificar fornecedores suspeitos ou valores anômalos.</p>
                </div>
                <div>
                  <h3 className="font-bold flex items-center gap-2">
                    <Badge variant="outline">2.8</Badge> Dashboards e Relatórios
                  </h3>
                  <p className="text-sm text-slate-600">Visão financeira total e relatórios de fechamento fiscal mensal.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>3. Modelo de Dados (Schema)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-md text-xs overflow-x-auto">
{`organizations (id, name, plan, created_at)
organization_members (id, organization_id, user_id, role, created_at)
companies (id, organization_id, cnpj, razao_social, nome_fantasia, uf, regime_tributario, created_at)
company_access (id, company_id, user_id)
digital_certificates (id, company_id, type, file_path, expires_at, status, created_at)
fiscal_documents (id, company_id, tipo, chave_acesso, numero, serie, ...)
manifestations (id, fiscal_document_id, tipo, usuario_id, created_at)
notifications (id, organization_id, company_id, type, channel, payload, ...)
api_keys (id, organization_id, key_hash, created_at, last_used_at)`}
              </pre>
              <p className="mt-4 text-sm text-slate-600 italic">
                * Aplicar Row Level Security (RLS) em todas as tabelas para garantir o isolamento entre organizações.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

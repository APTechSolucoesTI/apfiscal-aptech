import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, ShieldCheck, Zap, BarChart3, Clock, Users, Globe, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const features = [
    {
      title: "Monitoramento em Tempo Real",
      description: "Detectamos qualquer NF-e emitida contra o seu CNPJ no exato momento da autorização.",
      icon: <Clock className="h-6 w-6 text-blue-600" />,
    },
    {
      title: "Manifestação Automática",
      description: "Automatize a Ciência da Operação para garantir o download imediato do XML.",
      icon: <Zap className="h-6 w-6 text-blue-600" />,
    },
    {
      title: "Segurança de Dados",
      description: "Armazenamento seguro de XMLs por 5 anos, conforme exigência legal da Receita Federal.",
      icon: <ShieldCheck className="h-6 w-6 text-blue-600" />,
    },
    {
      title: "Dashboards Financeiros",
      description: "Visão consolidada de compras, impostos e fornecedores em um único painel.",
      icon: <BarChart3 className="h-6 w-6 text-blue-600" />,
    },
    {
      title: "Gestão de Certificados",
      description: "Controle centralizado de certificados A1 com avisos automáticos de expiração.",
      icon: <Globe className="h-6 w-6 text-blue-600" />,
    },
    {
      title: "Multi-Empresa",
      description: "Ideal para contabilidades e holdings: gerencie centenas de CNPJs em um só lugar.",
      icon: <Users className="h-6 w-6 text-blue-600" />,
    },
  ];

  const plans = [
    {
      name: "Starter",
      price: "R$ 99",
      description: "Para pequenas empresas que precisam de controle básico.",
      features: ["Até 2 CNPJs", "100 NF-e / mês", "Manifestação Manual", "Suporte via E-mail"],
      buttonText: "Começar Agora",
      popular: false,
    },
    {
      name: "Pro",
      price: "R$ 249",
      description: "O plano ideal para empresas em crescimento.",
      features: ["Até 10 CNPJs", "1.000 NF-e / mês", "Manifestação Automática", "Suporte Prioritário", "Dashboards Avançados"],
      buttonText: "Experimentar Grátis",
      popular: true,
    },
    {
      name: "Enterprise",
      price: "Sob consulta",
      description: "Solução completa para grandes volumes e grupos econômicos.",
      features: ["CNPJs Ilimitados", "Volume customizado", "API de Integração", "Gerente de conta dedicado", "SLA Garantido"],
      buttonText: "Falar com Consultor",
      popular: false,
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
            AP
          </div>
          <span className="font-bold text-xl text-slate-900">APFiscal</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          <a href="#recursos" className="text-sm font-medium text-slate-600 hover:text-blue-600">Recursos</a>
          <a href="#planos" className="text-sm font-medium text-slate-600 hover:text-blue-600">Preços</a>
          <Button asChild variant="outline" className="border-blue-600 text-blue-600 hover:bg-blue-50">
            <Link to="/login">Área do Cliente</Link>
          </Button>
          <Button asChild className="bg-blue-600 hover:bg-blue-700">
            <Link to="/login">Começar Grátis</Link>
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="px-6 py-20 lg:py-32 bg-gradient-to-b from-blue-50 to-white text-center">
        <Badge className="mb-4 px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-100 border-none">
          Compliance Fiscal Inteligente
        </Badge>
        <h1 className="text-4xl lg:text-6xl font-extrabold text-slate-900 tracking-tight max-w-4xl mx-auto leading-tight">
          Nunca mais perca uma <span className="text-blue-600">Nota Fiscal</span> emitida contra sua empresa.
        </h1>
        <p className="mt-6 text-xl text-slate-600 max-w-2xl mx-auto">
          Capture automaticamente NF-e, NFS-e e CT-e. Monitore manifestações, organize XMLs e evite fraudes com o APFiscal.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
          <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8">
            <Link to="/login">Criar Conta Gratuita</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="text-lg px-8">
            <Link to="/login">Acessar Área do Cliente</Link>
          </Button>
        </div>
      </section>

      {/* Features Grid */}
      <section id="recursos" className="px-6 py-24 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Tudo o que você precisa para gestão fiscal</h2>
            <p className="mt-4 text-slate-600">Recursos poderosos para automatizar seu departamento financeiro.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, i) => (
              <div key={i} className="p-8 rounded-2xl border border-slate-100 bg-slate-50 hover:border-blue-200 transition-colors">
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="planos" className="px-6 py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900">Planos simples e transparentes</h2>
            <p className="mt-4 text-slate-600">Escolha a melhor opção para o tamanho do seu negócio.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, i) => (
              <Card key={i} className={`relative flex flex-col ${plan.popular ? 'border-blue-600 shadow-xl scale-105 z-10' : 'border-slate-200'}`}>
                {plan.popular && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Mais Escolhido
                  </div>
                )}
                <CardHeader>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                    {plan.price !== "Sob consulta" && <span className="text-slate-500 font-medium">/mês</span>}
                  </div>
                  <ul className="space-y-4">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-slate-600">
                        <Check className="h-5 w-5 text-green-500 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button asChild className={`w-full ${plan.popular ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-900 hover:bg-black'}`}>
                    <Link to="/login">{plan.buttonText}</Link>
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="px-6 py-20 bg-blue-600 text-white text-center">
        <h2 className="text-3xl font-bold mb-6">Pronto para automatizar seu fiscal?</h2>
        <p className="text-blue-100 mb-10 max-w-xl mx-auto">
          Junte-se a centenas de empresas que já eliminam erros manuais e multas com o APFiscal.
        </p>
        <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-10">
          <Link to="/login">Começar Agora</Link>
        </Button>
      </section>

      {/* Real Footer */}
      <footer className="px-6 py-12 border-t bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
              AP
            </div>
            <span className="font-bold text-slate-900">APFiscal</span>
          </div>
          <div className="text-sm text-slate-500">
            © 2026 APFiscal. Todos os direitos reservados.
          </div>
          <div className="flex gap-6">
            <Link to="/login" className="text-sm text-slate-500 hover:text-blue-600">Termos</Link>
            <Link to="/login" className="text-sm text-slate-500 hover:text-blue-600">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

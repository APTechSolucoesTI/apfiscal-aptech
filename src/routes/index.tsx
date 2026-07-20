import { createFileRoute } from "@tanstack/react-router";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">1. Visão Geral do Produto</h1>
      <p>Construa um SaaS B2B chamado <strong>APFiscal</strong>, seguindo a mesma linha de naming do APChat (atendimento multicanal). O APFiscal é uma plataforma de <strong>monitoramento automático de documentos fiscais eletrônicos</strong> (NF-e, NFS-e, CT-e) para empresas brasileiras. O sistema atua como um "vigia fiscal" contínuo: identifica em tempo real qualquer nota emitida contra o CNPJ do cliente, armazena os arquivos com validade jurídica, permite ações de manifestação do destinatário e organiza tudo em dashboards financeiros/fiscais.</p>
      {/* Resto do conteúdo omitido por brevidade para a ferramenta... */}
    </div>
  );
}

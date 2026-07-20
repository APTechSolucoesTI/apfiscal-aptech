import { createFileRoute, useRouter } from "@tanstack/react-router";
import { NfeDetalhes } from "@/components/nfe/NfeDetalhes";

export const Route = createFileRoute("/_authenticated/documents/nfe/$nfeId")({
  component: NfeDetalhesPage,
});

function NfeDetalhesPage() {
  const { nfeId } = Route.useParams();
  return <NfeDetalhes nfeId={nfeId} />;
}

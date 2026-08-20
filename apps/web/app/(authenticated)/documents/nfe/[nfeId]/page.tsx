"use client";

import { useParams } from "@/lib/router-compat";
import { useRouter } from "@/lib/router-compat";
import { NfeDetalhes } from "@/components/nfe/NfeDetalhes";

function NfeDetalhesPage() {
  const { nfeId } = useParams<{ nfeId: string }>();
  return <NfeDetalhes nfeId={nfeId} />;
}

export default NfeDetalhesPage;

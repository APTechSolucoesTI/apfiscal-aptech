"use client";

import { useParams } from "@/lib/router-compat";
import { NfseDetails } from "@/components/nfse/NfseDetails";

export default function NfseDetailsPage() {
  const { nfseId } = useParams<{ nfseId: string }>();
  return <NfseDetails id={nfseId} />;
}

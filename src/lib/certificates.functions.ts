import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import forge from "node-forge";

type ParseInput = {
  companyId: string;
  fileName: string;
  fileBase64: string;
  password: string;
};

function parsePfx(base64: string, password: string) {
  const der = forge.util.decode64(base64);
  const asn1 = forge.asn1.fromDer(der);
  // Throws if password is wrong
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const bags = certBags[forge.pki.oids.certBag] ?? [];
  if (bags.length === 0) throw new Error("Nenhum certificado encontrado no arquivo.");

  // Pick the certificate with the latest notAfter (usually the leaf)
  let leaf = bags[0].cert!;
  for (const b of bags) {
    if (b.cert && b.cert.validity.notAfter > leaf.validity.notAfter) leaf = b.cert;
  }

  const subject = leaf.subject.attributes
    .map((a) => `${a.shortName || a.name}=${a.value}`)
    .join(", ");
  const issuer = leaf.issuer.attributes
    .map((a) => `${a.shortName || a.name}=${a.value}`)
    .join(", ");

  return {
    subject,
    issuer,
    notBefore: leaf.validity.notBefore.toISOString(),
    notAfter: leaf.validity.notAfter.toISOString(),
    serialNumber: leaf.serialNumber,
  };
}

export const installCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ParseInput) => {
    if (!input?.companyId) throw new Error("Empresa é obrigatória.");
    if (!input?.fileBase64) throw new Error("Arquivo é obrigatório.");
    if (typeof input.password !== "string") throw new Error("Senha inválida.");
    return input;
  })
  .handler(async ({ data, context }) => {
    let parsed;
    try {
      parsed = parsePfx(data.fileBase64, data.password);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      if (
        msg.includes("mac") ||
        msg.includes("password") ||
        msg.includes("invalid") ||
        msg.includes("decrypt")
      ) {
        throw new Error("Senha do certificado incorreta.");
      }
      throw new Error("Arquivo de certificado inválido ou corrompido.");
    }

    const { supabase } = context;

    // Verify user has access to the company
    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("id, organization_id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (companyErr || !company) throw new Error("Empresa não encontrada ou sem acesso.");

    const now = Date.now();
    const notAfterMs = new Date(parsed.notAfter).getTime();
    const status = notAfterMs < now ? "expired" : "active";

    const { error } = await supabase.from("digital_certificates").insert({
      company_id: data.companyId,
      type: "A1",
      file_path: data.fileName,
      expires_at: parsed.notAfter,
      status,
    } as never);
    if (error) throw new Error(error.message);

    return {
      ok: true,
      expiresAt: parsed.notAfter,
      subject: parsed.subject,
      issuer: parsed.issuer,
    };
  });

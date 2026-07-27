// Criptografia da API key das empresas (AES-GCM, chave derivada de APFISCAL_ENC_KEY).
// Server-only.

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.APFISCAL_ENC_KEY;
  if (!secret) throw new Error("APFISCAL_ENC_KEY não configurada no servidor.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptApiKey(plain: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  return `${toBase64(iv)}.${toBase64(cipher)}`;
}

export async function decryptApiKey(stored: string): Promise<string> {
  const [ivPart, cipherPart] = stored.split(".");
  if (!ivPart || !cipherPart) throw new Error("Chave de API armazenada em formato inválido.");
  const key = await getKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(cipherPart),
  );
  return new TextDecoder().decode(plain);
}

export function last4(value: string): string {
  return value.slice(-4);
}

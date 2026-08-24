export type NfseDocument = { nsu: number; accessKey: string | null; contentType: string | null; rawDocument: string; payloadHash: string };
export interface NfseProvider {
  readonly kind: string;
  test(companyId: string): Promise<{ ok: boolean; message: string }>;
  fetch(companyId: string, nsu: number): Promise<NfseDocument | null>;
}

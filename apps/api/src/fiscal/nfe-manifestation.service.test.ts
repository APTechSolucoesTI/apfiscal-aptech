import { describe, expect, it, vi } from "vitest";
import type { FiscalSyncService } from "./fiscal-sync.service";
import { NfeManifestationService } from "./nfe-manifestation.service";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

type ManifestResult = Awaited<ReturnType<NfeManifestationService["manifest"]>>;

function result(overrides: Partial<ManifestResult> = {}): ManifestResult {
  return {
    cStat: "135",
    xMotivo: "Evento registrado e vinculado à NF-e",
    accepted: true,
    idempotent: false,
    refresh: { attempted: true, completed: false },
    lifecycle: {
      document: "waiting_full_xml",
      manifestation: "science",
      visibleInSummaryCenter: true,
      requiresManifestation: true,
      waitingForFullXml: true,
    },
    ...overrides,
  };
}

describe("NfeManifestationService", () => {
  it("requires a meaningful justification for an operation not performed", async () => {
    const service = new NfeManifestationService({} as FiscalSyncService);

    await expect(
      service.manifest({
        companyId: crypto.randomUUID(),
        accessKey: "3".repeat(44),
        event: "nao_realizada",
        justification: "curta",
        userId: crypto.randomUUID(),
      }),
    ).rejects.toThrow("pelo menos 15 caracteres");
  });

  it("reports each batch outcome without hiding rejection, idempotency or transient error", async () => {
    const service = new NfeManifestationService({} as FiscalSyncService);
    vi.spyOn(service, "manifest")
      .mockResolvedValueOnce(result())
      .mockResolvedValueOnce(result({ idempotent: true }))
      .mockResolvedValueOnce(result({ accepted: false, cStat: "5731", xMotivo: "Rejeição fiscal" }))
      .mockRejectedValueOnce(new Error("Falha transitória"));

    const batch = await service.manifestBatch({
      companyId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      documents: ["1", "2", "3", "4"].map((digit) => ({
        accessKey: digit.repeat(44),
        event: "ciencia" as const,
      })),
    });

    expect(batch).toMatchObject({ total: 4, processed: 1, idempotent: 1, failed: 2 });
    expect(batch.results.map((item) => item.message)).toEqual([
      "Evento registrado e vinculado à NF-e",
      "Evento registrado e vinculado à NF-e",
      "Rejeição fiscal",
      "Falha transitória",
    ]);
  });
});

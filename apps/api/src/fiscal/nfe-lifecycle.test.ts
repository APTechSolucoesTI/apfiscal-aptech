import { describe, expect, it } from "vitest";
import { deriveNfeLifecycle, manifestationAccepted, manifestationState } from "./nfe-lifecycle";

describe("NF-e lifecycle", () => {
  it("never sends a complete NF-e to the summarized center", () => {
    expect(deriveNfeLifecycle({ hasFullXml: true })).toMatchObject({
      document: "full",
      manifestation: "pending",
      visibleInSummaryCenter: false,
      requiresManifestation: false,
    });
  });

  it("keeps science non-conclusive while waiting for the complete XML", () => {
    expect(deriveNfeLifecycle({ hasFullXml: false, acceptedEvents: ["ciencia"] })).toMatchObject({
      document: "waiting_full_xml",
      manifestation: "science",
      requiresManifestation: true,
      waitingForFullXml: true,
    });
  });

  it("lets confirmation supersede science without losing history", () => {
    expect(manifestationState(["ciencia", "confirmacao"])).toBe("confirmed");
    expect(
      deriveNfeLifecycle({ hasFullXml: false, acceptedEvents: ["ciencia", "confirmacao"] }),
    ).toMatchObject({ manifestation: "confirmed", requiresManifestation: false });
  });

  it("recognizes accepted and duplicate-event SEFAZ responses", () => {
    expect(manifestationAccepted("135")).toBe(true);
    expect(manifestationAccepted("136")).toBe(true);
    expect(manifestationAccepted("573")).toBe(true);
    expect(manifestationAccepted("5730")).toBe(false);
  });
});

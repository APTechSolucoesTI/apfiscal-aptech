import { describe, expect, it } from "vitest";
import { isApprovedNfseStatus } from "./nfse-document-parser";

describe("isApprovedNfseStatus", () => {
  it.each(["100", "102", "103", "107"])("aceita o cStat %s como processado", (status) => {
    expect(isApprovedNfseStatus(status)).toBe(true);
  });

  it.each([null, "", "101", "999"])("não aprova o status %s", (status) => {
    expect(isApprovedNfseStatus(status)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { sefazEventTimestamp } from "./sefaz-date";

describe("sefazEventTimestamp", () => {
  it("formats the manifestation with the raw local time and runtime offset", () => {
    const local = new Date(2026, 7, 27, 12, 7, 14, 271);
    const expectedOffset = -local.getTimezoneOffset();
    const sign = expectedOffset >= 0 ? "+" : "-";
    const hours = String(Math.floor(Math.abs(expectedOffset) / 60)).padStart(2, "0");
    const minutes = String(Math.abs(expectedOffset) % 60).padStart(2, "0");
    expect(sefazEventTimestamp(local)).toBe(`2026-08-27T12:07:14${sign}${hours}:${minutes}`);
  });

  it("never emits milliseconds or the UTC Z suffix rejected by the SEFAZ schema", () => {
    const timestamp = sefazEventTimestamp(new Date("2026-01-02T03:04:05.999Z"));
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(timestamp).not.toContain(".");
    expect(timestamp.endsWith("Z")).toBe(false);
  });
});

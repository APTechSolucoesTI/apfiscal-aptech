import { describe, expect, it } from "vitest";
import { sefazEventTimestamp } from "./sefaz-date";

describe("sefazEventTimestamp", () => {
  it("formats the manifestation time with seconds and the required Brazilian offset", () => {
    expect(sefazEventTimestamp(new Date("2026-08-27T15:07:14.271Z"))).toBe(
      "2026-08-27T12:07:14-03:00",
    );
  });

  it("never emits milliseconds or the UTC Z suffix rejected by the SEFAZ schema", () => {
    const timestamp = sefazEventTimestamp(new Date("2026-01-02T03:04:05.999Z"));
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
    expect(timestamp).not.toContain(".");
    expect(timestamp.endsWith("Z")).toBe(false);
  });
});

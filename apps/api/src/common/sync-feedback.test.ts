import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cooldownException, cooldownMessage, retryAfterDate } from "./sync-feedback";

describe("sync feedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T15:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("respeita Retry-After em segundos", () => {
    expect(retryAfterDate("3600").toISOString()).toBe("2026-08-24T16:00:00.000Z");
  });

  it("respeita Retry-After com uma data HTTP", () => {
    expect(retryAfterDate("Mon, 24 Aug 2026 15:30:00 GMT").toISOString()).toBe(
      "2026-08-24T15:30:00.000Z",
    );
  });

  it("usa o período seguro quando o provedor não informa Retry-After", () => {
    expect(retryAfterDate(undefined, 20).toISOString()).toBe("2026-08-24T15:20:00.000Z");
  });

  it("informa duração, horário e retomada automática", () => {
    const retryAt = new Date("2026-08-24T16:00:00.000Z");
    const message = cooldownMessage("SEFAZ", retryAt);
    expect(message).toContain("1 hora");
    expect(message).toContain("sincronização automática continuará ativa");

    const exception = cooldownException("SEFAZ", retryAt);
    expect(exception.getStatus()).toBe(429);
    expect(exception.getResponse()).toMatchObject({
      code: "SYNC_COOLDOWN",
      retryAt: "2026-08-24T16:00:00.000Z",
      retryAfterSeconds: 3600,
    });
  });
});

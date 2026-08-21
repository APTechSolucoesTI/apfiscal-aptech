import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("never stores the plain password and validates only the original value", async () => {
    const hash = await hashPassword("uma-senha-longa-e-exclusiva");
    expect(hash).not.toContain("uma-senha-longa-e-exclusiva");
    await expect(verifyPassword("uma-senha-longa-e-exclusiva", hash)).resolves.toBe(true);
    await expect(verifyPassword("senha-incorreta", hash)).resolves.toBe(false);
  });
});

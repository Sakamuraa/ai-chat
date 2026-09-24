// language: TypeScript, file: lib/lib.test.ts, target: vitest (tanpa server, tanpa DB)
import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword, sha256 } from "./auth";
import { allow, reset, clientIp } from "./rate-limit";

describe("password hashing", () => {
  it("hash berbeda untuk input sama (salt acak)", () => {
    expect(hashPassword("secret-123")).not.toBe(hashPassword("secret-123"));
  });

  it("verify benar untuk password yang cocok", () => {
    const h = hashPassword("secret-123");
    expect(verifyPassword("secret-123", h)).toBe(true);
  });

  it("verify salah untuk password berbeda", () => {
    const h = hashPassword("secret-123");
    expect(verifyPassword("secret-456", h)).toBe(false);
  });

  it("hash rusak tidak melempar", () => {
    expect(verifyPassword("x", "tanpa-format")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });

  it("sha256 deterministik", () => {
    expect(sha256("abc")).toBe(sha256("abc"));
    expect(sha256("abc")).not.toBe(sha256("abd"));
  });
});

describe("rate limit", () => {
  beforeEach(() => reset());

  it("mengizinkan sampai batas lalu menolak", () => {
    for (let i = 0; i < 10; i++) expect(allow("k", 10)).toBe(true);
    expect(allow("k", 10)).toBe(false);
  });

  it("bucket terpisah per key", () => {
    for (let i = 0; i < 10; i++) allow("a", 10);
    expect(allow("a", 10)).toBe(false);
    expect(allow("b", 10)).toBe(true);
  });

  it("clientIp baca x-forwarded-for pertama", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" });
    expect(clientIp(h)).toBe("1.2.3.4");
  });
});

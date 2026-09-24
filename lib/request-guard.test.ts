// language: TypeScript, file: lib/request-guard.test.ts, target: vitest — gerbang same-origin
import { describe, it, expect } from "vitest";
import { checkSameOrigin } from "./request-guard";

const H = (rec: Record<string, string | null>) => ({
  get: (n: string) => (n in rec ? rec[n] : null),
});

const HOST = "ai.onheil.fun";

describe("checkSameOrigin", () => {
  it("menerima Origin yang sama host", () => {
    expect(checkSameOrigin(H({ origin: "https://ai.onheil.fun", host: HOST }))).toEqual({ ok: true });
    expect(checkSameOrigin(H({ origin: "http://ai.onheil.fun", host: HOST }))).toEqual({ ok: true });
  });

  it("menolak Origin domain lain (CSRF / pemakaian dari situs lain)", () => {
    const v = checkSameOrigin(H({ origin: "https://evil.example.com", host: HOST }));
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("cross_origin");
  });

  it("menolak subdomain sendiri yang bukan tujuan (same-site ≠ same-origin)", () => {
    expect(checkSameOrigin(H({ origin: "https://staging.onheil.fun", host: HOST })).ok).toBe(false);
  });

  it("menolak Origin: null (sandbox / iframe opaque)", () => {
    expect(checkSameOrigin(H({ origin: "null", host: HOST })).reason).toBe("opaque_origin");
  });

  it("menerima fetch browser tanpa Origin kalau Sec-Fetch-Site = same-origin", () => {
    expect(checkSameOrigin(H({ "sec-fetch-site": "same-origin", host: HOST }))).toEqual({ ok: true });
  });

  it("menolak Sec-Fetch-Site selain same-origin", () => {
    expect(checkSameOrigin(H({ "sec-fetch-site": "same-site", host: HOST })).ok).toBe(false);
    expect(checkSameOrigin(H({ "sec-fetch-site": "cross-site", host: HOST })).ok).toBe(false);
    expect(checkSameOrigin(H({ "sec-fetch-site": "none", host: HOST })).ok).toBe(false);
  });

  it("menolak curl/skrip murni (tanpa Origin & tanpa Sec-Fetch-Site)", () => {
    const v = checkSameOrigin(H({ host: HOST }));
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("no_origin_headers");
  });

  it("x-forwarded-host lebih dipercaya daripada host (di belakang proxy)", () => {
    expect(
      checkSameOrigin(H({ origin: "https://ai.onheil.fun", "x-forwarded-host": "ai.onheil.fun", host: "internal:443" })).ok,
    ).toBe(true);
    expect(
      checkSameOrigin(H({ origin: "https://evil.test", "x-forwarded-host": "ai.onheil.fun", host: "evil.test" })).ok,
    ).toBe(false);
  });

  it("Origin rusak (bukan URL) ditolak, bukan crash", () => {
    expect(checkSameOrigin(H({ origin: "bukan-url", host: HOST })).reason).toBe("bad_origin");
  });
});

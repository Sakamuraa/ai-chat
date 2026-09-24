// language: TypeScript, file: lib/quota.test.ts, target: vitest — aturan kuota token
import { describe, it, expect } from "vitest";
import { checkQuota, dailyTokenLimit, estimateTokens, remainingToday, type QuotaState } from "./quota";

const base = (over: Partial<QuotaState> = {}): QuotaState => ({
  dailyUsed: 0,
  dailyLimit: 10_000_000,
  sub: null,
  ...over,
});

const NOW = new Date("2026-09-24T12:00:00Z");

describe("checkQuota", () => {
  it("tanpa langganan: jalan selama belum menyentuh batas harian", () => {
    expect(checkQuota(base({ dailyUsed: 9_999_999 }), NOW)).toEqual({ ok: true, kind: "daily" });
    expect(checkQuota(base({ dailyUsed: 10_000_000 }), NOW)).toEqual({ ok: false, kind: "daily_exceeded" });
  });

  it("langganan unlimited menembus batas harian sampai kadaluarsa", () => {
    const st = base({
      dailyUsed: 99_999_999,
      sub: { tokenLimit: null, remaining: null, validUntil: "2026-12-31T00:00:00Z" },
    });
    expect(checkQuota(st, NOW)).toEqual({ ok: true, kind: "unlimited" });
  });

  it("langganan berisi token: dicek sisa token, bukan batas harian", () => {
    const st = base({
      dailyUsed: 9_999_999,
      sub: { tokenLimit: 10_000_000, remaining: 1234, validUntil: "2026-12-31T00:00:00Z" },
    });
    expect(checkQuota(st, NOW)).toEqual({ ok: true, kind: "sub" });

    const habis = base({
      dailyUsed: 0,
      sub: { tokenLimit: 10_000_000, remaining: 0, validUntil: "2026-12-31T00:00:00Z" },
    });
    expect(checkQuota(habis, NOW)).toEqual({ ok: false, kind: "sub_exhausted" });
  });

  it("langganan kadaluarsa -> kembali ke batas harian", () => {
    const st = base({
      dailyUsed: 10_000_000,
      sub: { tokenLimit: 1_000_000_000, remaining: 900_000_000, validUntil: "2026-09-24T11:59:59Z" },
    });
    expect(checkQuota(st, NOW)).toEqual({ ok: false, kind: "daily_exceeded" });
  });
});

describe("dailyTokenLimit", () => {
  it("default 10 juta", () => {
    const prev = process.env.DAILY_TOKEN_LIMIT;
    delete process.env.DAILY_TOKEN_LIMIT;
    expect(dailyTokenLimit()).toBe(10_000_000);
    process.env.DAILY_TOKEN_LIMIT = "5000000";
    expect(dailyTokenLimit()).toBe(5_000_000);
    process.env.DAILY_TOKEN_LIMIT = "0";
    expect(dailyTokenLimit()).toBe(10_000_000); // nilai rusak -> kembali default
    if (prev === undefined) delete process.env.DAILY_TOKEN_LIMIT;
    else process.env.DAILY_TOKEN_LIMIT = prev;
  });
});

describe("estimateTokens / remainingToday", () => {
  it("perkiraan ~4 char per token, minimal 1", () => {
    expect(estimateTokens("")).toBe(1);
    expect(estimateTokens("x".repeat(400))).toBe(100);
  });

  it("sisa hari ini mengikuti aturan aktif", () => {
    expect(remainingToday(base({ dailyUsed: 4_000_000 }))).toBe(6_000_000);
    expect(remainingToday(base({ dailyUsed: 10_000_000 }))).toBe(0);
    expect(
      remainingToday(base({ sub: { tokenLimit: null, remaining: null, validUntil: "2026-12-31T00:00:00Z" } })),
    ).toBe(Infinity);
  });
});

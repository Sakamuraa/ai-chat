// language: TypeScript, file: lib/quota.test.ts, target: tes aturan kuota ala Claude (5 jam + mingguan, per plan)
import { describe, it, expect } from "vitest";
import {
  checkQuota,
  estimateTokens,
  fiveHourPeriod,
  fiveHourTokenLimit,
  remainingWindows,
  weeklyPeriod,
  weeklyTokenLimit,
  FIVE_HOUR_MS,
  type QuotaState,
} from "./quota";

const NOW = new Date("2026-09-30T10:00:00Z"); // Rabu

function base(over: Partial<QuotaState> = {}): QuotaState {
  return {
    fiveHourUsed: 0,
    fiveHourLimit: fiveHourTokenLimit(),
    weeklyUsed: 0,
    weeklyLimit: weeklyTokenLimit(),
    sub: null,
    ...over,
  };
}

describe("checkQuota (tanpa langganan)", () => {
  it("jendela 5 jam: lolos di bawah limit, mentok di limit", () => {
    expect(checkQuota(base({ fiveHourUsed: fiveHourTokenLimit() - 1 }), NOW)).toEqual({
      ok: true,
      kind: "window",
    });
    expect(checkQuota(base({ fiveHourUsed: fiveHourTokenLimit() }), NOW)).toEqual({
      ok: false,
      kind: "five_hour_exceeded",
    });
  });

  it("mingguan: lolos di bawah limit, mentok di limit", () => {
    expect(checkQuota(base({ weeklyUsed: weeklyTokenLimit() - 1 }), NOW)).toEqual({
      ok: true,
      kind: "window",
    });
    expect(checkQuota(base({ weeklyUsed: weeklyTokenLimit() }), NOW)).toEqual({
      ok: false,
      kind: "weekly_exceeded",
    });
  });

  it("jendela 5 jam dicek lebih dulu — dua-duanya penuh -> lima jam", () => {
    const st = base({ fiveHourUsed: fiveHourTokenLimit(), weeklyUsed: weeklyTokenLimit() });
    expect(checkQuota(st, NOW)).toEqual({ ok: false, kind: "five_hour_exceeded" });
  });

  it("jendela 5 jam penuh tapi mingguan masih ada -> tetap ditolak (5 jam menang)", () => {
    const st = base({ fiveHourUsed: fiveHourTokenLimit(), weeklyUsed: 0 });
    expect(checkQuota(st, NOW)).toEqual({ ok: false, kind: "five_hour_exceeded" });
  });
});

describe("checkQuota (dengan langganan)", () => {
  it("langganan unlimited menembus kedua jendela sampai kadaluarsa", () => {
    const st = base({
      fiveHourUsed: 99_999_999,
      weeklyUsed: 99_999_999,
      sub: { tokenLimit: null, remaining: null, validUntil: "2026-12-31T00:00:00Z" },
    });
    expect(checkQuota(st, NOW)).toEqual({ ok: true, kind: "unlimited" });
  });

  it("langganan berisi token: dicek sisa token, bukan jendela", () => {
    const st = base({
      fiveHourUsed: 1_000_000,
      sub: { tokenLimit: 5_000, remaining: 100, validUntil: "2026-12-31T00:00:00Z" },
    });
    expect(checkQuota(st, NOW)).toEqual({ ok: true, kind: "sub" });
  });

  it("sisa langganan 0 -> sub_exhausted", () => {
    const st = base({
      sub: { tokenLimit: 5_000, remaining: 0, validUntil: "2026-12-31T00:00:00Z" },
    });
    expect(checkQuota(st, NOW)).toEqual({ ok: false, kind: "sub_exhausted" });
  });

  it("langganan kadaluarsa -> kembali ke aturan jendela", () => {
    const st = base({
      fiveHourUsed: 1_000_000, // ≥ limit free (500 rb) — tetap ditolak
      sub: { tokenLimit: null, remaining: null, validUntil: "2026-01-01T00:00:00Z" },
    });
    expect(checkQuota(st, NOW)).toEqual({ ok: false, kind: "five_hour_exceeded" });
  });
});

describe("period id", () => {
  it("jendela 5 jam tetap anchored ke epoch: reset wal-clock tiap 5 jam", () => {
    // snap ke awal bucket dulu — "2026-09-30T00:00:00Z" sendiri jatuh 4 jam
    // setelah boundary epoch, jadi keliru kalau dipakai apa adanya.
    const anchor = new Date("2026-09-30T00:00:00Z").getTime();
    const t0 = new Date(Math.floor(anchor / FIVE_HOUR_MS) * FIVE_HOUR_MS);
    const t1 = new Date(t0.getTime() + FIVE_HOUR_MS - 1);
    const t2 = new Date(t0.getTime() + FIVE_HOUR_MS);
    expect(fiveHourPeriod(t0)).toBe(fiveHourPeriod(t1));
    expect(fiveHourPeriod(t0)).not.toBe(fiveHourPeriod(t2));
  });

  it("mingguan = tanggal Senin UTC; Rabu & Minggu minggu yang sama, Senin pindah", () => {
    const rabu = new Date("2026-09-30T10:00:00Z"); // Rabu
    const minggu = new Date("2026-10-04T23:59:00Z"); // Minggu
    const senin = new Date("2026-10-05T00:00:00Z"); // Senin
    expect(weeklyPeriod(rabu)).toBe("2026-09-28"); // Senin sebelum Rabu
    expect(weeklyPeriod(minggu)).toBe("2026-09-28");
    expect(weeklyPeriod(senin)).toBe("2026-10-05");
  });
});

describe("limit per plan (2026-10-01: base 500 rb, pro 3×)", () => {
  it("jendela 5 jam: free 500 rb · pro 1,5 jt · max 5 jt", () => {
    expect(fiveHourTokenLimit("free")).toBe(500_000);
    expect(fiveHourTokenLimit("pro")).toBe(1_500_000);
    expect(fiveHourTokenLimit("max")).toBe(5_000_000);
    expect(fiveHourTokenLimit()).toBe(500_000); // default = free
  });

  it("mingguan = 10× jendela 5 jam: 5 jt · 15 jt · 50 jt", () => {
    expect(weeklyTokenLimit("free")).toBe(5_000_000);
    expect(weeklyTokenLimit("pro")).toBe(15_000_000);
    expect(weeklyTokenLimit("max")).toBe(50_000_000);
    expect(weeklyTokenLimit()).toBe(5_000_000); // default = free
  });
});

describe("estimateTokens / remainingWindows", () => {
  it("perkiraan ~4 char per token, minimal 1", () => {
    expect(estimateTokens("")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("sisa jendela = limit - used; penuh = 0; unlimited = Infinity", () => {
    // free: limit 5 jam 500 rb, mingguan 5 jt
    expect(remainingWindows(base({ fiveHourUsed: 400_000, weeklyUsed: 1_000_000 }))).toEqual({
      fiveHour: 100_000,
      weekly: 4_000_000,
    });
    expect(remainingWindows(base({ fiveHourUsed: 1_000_000 })).fiveHour).toBe(0);
    expect(
      remainingWindows(base({ sub: { tokenLimit: null, remaining: null, validUntil: "2026-12-31T00:00:00Z" } })),
    ).toEqual({ fiveHour: Infinity, weekly: Infinity });
  });
});

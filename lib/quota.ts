// language: TypeScript, file: lib/quota.ts, target: aturan kuota token ala Claude (murni, gampang dites)
import { planTokenLimit, type Plan } from "./plans";
/**
 * Kebijakan (permintaan Manuel, 2026-09-30 — "mengikuti Claude asli";
 * 2026-10-01: base 500 rb + beda per plan):
 *  - Tanpa langganan ada DUA jendela yang dicek bersama-sama:
 *      * jendela 5 jam  : limit per plan (lib/plans.ts):
 *          Standard 500 rb · Pro 1,5 jt · Max 5 jt per window.
 *        Period dihitung tetap: floor(epoch_ms / 5 jam) — reset wal-clock tiap 5 jam.
 *      * mingguan        : limit = 10× jendela 5 jam:
 *          Standard 5 jt · Pro 15 jt · Max 50 jt per minggu.
 *        Period = tanggal Senin UTC — reset tiap Senin 00.00 UTC.
 *    Lolos KEDUA jendela baru boleh chat; salah satu penuh -> 429.
 *  - Punya langganan aktif -> langganan MENGANTIKAN jendela (sama seperti sistem lama):
 *      * token_limit = NULL (unlimited) -> bebas sampai valid_until
 *      * token_limit = N                 -> N token untuk seluruh jendela langganan
 *  - Semua angka tetap satu sumber: lib/plans.ts.
 */

export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;

export type QuotaState = {
  fiveHourUsed: number;
  fiveHourLimit: number;
  weeklyUsed: number;
  weeklyLimit: number;
  sub: { tokenLimit: number | null; remaining: number | null; validUntil: string } | null;
};

export type QuotaVerdict =
  | { ok: true; kind: "window" | "sub" | "unlimited" }
  | { ok: false; kind: "five_hour_exceeded" | "weekly_exceeded" | "sub_exhausted" };

/** Limit jendela 5 jam per plan (satu sumber: lib/plans.ts).
 *  Standard 500 rb · Pro 1,5 jt · Max 5 jt per window. */
export function fiveHourTokenLimit(plan: Plan = "free"): number {
  return planTokenLimit(plan);
}

/** Limit mingguan per plan = 10× jendela 5 jam (≈2 hari pemakaian penuh per
 *  minggu — tidak kebanyakan, tidak kedikitan):
 *  Standard 5 jt · Pro 15 jt · Max 50 jt. */
export function weeklyTokenLimit(plan: Plan = "free"): number {
  return fiveHourTokenLimit(plan) * 10;
}

/** Id jendela 5 jam (tetap, anchored ke epoch — reset wal-clock tiap 5 jam). */
export function fiveHourPeriod(now: Date = new Date()): string {
  return String(Math.floor(now.getTime() / FIVE_HOUR_MS));
}

/** Id mingguan = tanggal Senin UTC 'YYYY-MM-DD' (reset tiap Senin 00.00 UTC). */
export function weeklyPeriod(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7; // Senin=0 … Minggu=6
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d.toISOString().slice(0, 10);
}

export function checkQuota(state: QuotaState, now: Date = new Date()): QuotaVerdict {
  const { sub } = state;
  if (sub && new Date(sub.validUntil) > now) {
    if (sub.tokenLimit === null) return { ok: true, kind: "unlimited" };
    if ((sub.remaining ?? 0) <= 0) return { ok: false, kind: "sub_exhausted" };
    return { ok: true, kind: "sub" };
  }
  if (state.fiveHourUsed >= state.fiveHourLimit) return { ok: false, kind: "five_hour_exceeded" };
  if (state.weeklyUsed >= state.weeklyLimit) return { ok: false, kind: "weekly_exceeded" };
  return { ok: true, kind: "window" };
}

/** Perkiraan token kalau gateway tidak menyertakan `usage` di stream: ~4 char/token. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Sisa jendela 5 jam / mingguan (untuk ditampilkan). Langganan unlimited = Infinity. */
export function remainingWindows(state: QuotaState): { fiveHour: number; weekly: number } {
  const v = checkQuota(state);
  if (v.kind === "unlimited") return { fiveHour: Infinity, weekly: Infinity };
  if (v.kind === "sub" && state.sub) {
    const r = Math.max(0, state.sub.remaining ?? 0);
    return { fiveHour: r, weekly: r };
  }
  if (!v.ok) return { fiveHour: 0, weekly: 0 };
  return {
    fiveHour: Math.max(0, state.fiveHourLimit - state.fiveHourUsed),
    weekly: Math.max(0, state.weeklyLimit - state.weeklyUsed),
  };
}

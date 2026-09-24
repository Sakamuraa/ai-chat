// language: TypeScript, file: lib/quota.ts, target: aturan kuota token (murni, gampang dites)
/**
 * Kebijakan (permintaan Manuel, 2026-09-24):
 *  - Batas dasar: DAILY_TOKEN_LIMIT token per hari UTC (default 10 juta).
 *  - Punya langganan aktif -> langganan MENGANTIKAN batas harian:
 *      * token_limit = NULL (unlimited)  -> bebas sampai valid_until
 *      * token_limit = N                 -> N token untuk seluruh jendela langganan,
 *                                            sisa token menyusut tiap chat
 *  - Tanpa langganan -> pakai batas harian.
 */

export type QuotaState = {
  dailyUsed: number;
  dailyLimit: number;
  sub: { tokenLimit: number | null; remaining: number | null; validUntil: string } | null;
};

export type QuotaVerdict =
  | { ok: true; kind: "daily" | "sub" | "unlimited" }
  | { ok: false; kind: "daily_exceeded" | "sub_exhausted" };

export function dailyTokenLimit(): number {
  const raw = process.env.DAILY_TOKEN_LIMIT;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10_000_000;
}

export function checkQuota(state: QuotaState, now: Date = new Date()): QuotaVerdict {
  const { sub } = state;
  if (sub && new Date(sub.validUntil) > now) {
    if (sub.tokenLimit === null) return { ok: true, kind: "unlimited" };
    if ((sub.remaining ?? 0) <= 0) return { ok: false, kind: "sub_exhausted" };
    return { ok: true, kind: "sub" };
  }
  if (state.dailyUsed >= state.dailyLimit) return { ok: false, kind: "daily_exceeded" };
  return { ok: true, kind: "daily" };
}

/** Perkiraan token kalau gateway tidak menyertakan `usage` di stream: ~4 char/token. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Sisa kuota hari ini (untuk ditampilkan / log). Langganan unlimited = Infinity. */
export function remainingToday(state: QuotaState): number {
  const v = checkQuota(state);
  if (!v.ok) return 0;
  if (v.kind === "unlimited") return Infinity;
  if (v.kind === "sub" && state.sub) return Math.max(0, state.sub.remaining ?? 0);
  return Math.max(0, state.dailyLimit - state.dailyUsed);
}

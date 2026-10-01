// language: TypeScript, file: lib/plans.ts, target: hak akses model per paket (client & server)
/**
 * Paket (permintaan Manuel, 2026-09-24; dirapikan 2026-09-30):
 *   free -> onheil-1.1-luna, onheil-1.1-aria
 *   pro  -> + onheil-1.5-selenia, onheil-2-asteria
 *   max  -> + claude-opus-5-5, claude-fable-5-1
 * 2026-09-30 (hanya frontend): solaria, celestia, istaroth DIHAPUS dari daftar;
 * claude-opus-5-5 (koreksi Manuel): asteria naik ke Pro, dua model Claude = Max;
 * claude-fable-5-1 ditambahkan ke Max. Keduanya sudah ada di 9router.
 * Paket efektif = langganan aktif, kalau tidak ada -> paket bawaan akun.
 */
export type Plan = "free" | "pro" | "max";

export const PLANS: { id: Plan; label: string }[] = [
  { id: "free", label: "Standard" },
  { id: "pro", label: "Pro" },
  { id: "max", label: "Max" },
];

/** Limit token per plan — SATU sumber angka (permintaan Manuel, 2026-09-26;
 *  2026-10-01 base diturunkan ke 500 rb):
 *  Standard (free) = 500 rb · Pro = 3× free (1,5 jt) · Max = 10× free (5 jt).
 *  Dipakai jendela kuota (5 jam/mingguan) DAN sisa token kode langganan.
 *  Persentase limit SELALU 100% untuk semua plan — yang membedakan hanya token.
 *  Semua informasi diturunkan dari sini, tidak diinput/di-hardcode terpisah. */
export const FREE_TOKEN_LIMIT = 500_000;
const LIMIT_MULTIPLIER: Record<Plan, number> = { free: 1, pro: 3, max: 10 };

/** Total token satu langganan untuk plan ini (dipakai createCode). */
export function planTokenLimit(p: Plan): number {
  return FREE_TOKEN_LIMIT * LIMIT_MULTIPLIER[p];
}

/** Limit tampil selalu 100% — persen bukan skala antar plan (koreksi Manuel). */
export const PLAN_LIMIT_PERCENT = 100;

/** Amankan nilai mentah (dari DB) jadi Plan valid. */
export function coercePlan(v: string | null | undefined): Plan {
  return isPlan(v) ? v : "free";
}

export const MODEL_LABELS: Record<string, string> = {
  "onheil-1.1-luna": "Onheil 1.1 Luna",
  "onheil-1.1-aria": "Onheil 1.1 Aria",
  "onheil-1.5-selenia": "Onheil 1.5 Selenia",
  "onheil-2-asteria": "Onheil 2 Asteria",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-fable-5-1": "Claude Fable 5.1",
};

const RANK: Record<Plan, number> = { free: 0, pro: 1, max: 2 };

export const PLAN_MODELS: Record<Plan, string[]> = {
  free: ["onheil-1.1-luna", "onheil-1.1-aria"],
  pro: ["onheil-1.1-luna", "onheil-1.1-aria", "onheil-1.5-selenia", "onheil-2-asteria"],
  max: [
    "onheil-1.1-luna",
    "onheil-1.1-aria",
    "onheil-1.5-selenia",
    "onheil-2-asteria",
    "claude-opus-5-5",
    "claude-fable-5-1",
  ],
};

export function isPlan(v: unknown): v is Plan {
  return v === "free" || v === "pro" || v === "max";
}

export function planRank(p: Plan): number {
  return RANK[p];
}

/** Paket efektif: langganan aktif boleh menaikkan; tidak pernah menurunkan di bawah paket akun. */
export function effectivePlan(
  accountPlan: string | null | undefined,
  subPlan: string | null | undefined,
  subValidUntil: string | null | undefined,
  now: Date = new Date(),
): Plan {
  const base: Plan = isPlan(accountPlan) ? accountPlan : "free";
  if (subPlan && isPlan(subPlan) && subValidUntil && new Date(subValidUntil) > now) {
    return RANK[subPlan] >= RANK[base] ? subPlan : base;
  }
  return base;
}

export function allowedModels(plan: Plan): string[] {
  return PLAN_MODELS[plan];
}

export function modelAllowed(plan: Plan, model: string): boolean {
  return PLAN_MODELS[plan].includes(model);
}

/** Badge paket yang dibutuhkan tiap model (tampil di dropdown walau paket belum punya) */
/** Model yang executor-nya MENOLAK OpenAI function tools (kimi-web dulu membalas 400
 *  "Kimi Web does not support OpenAI function tools"). Kosong untuk sekarang:
 *  target istaroth sudah diganti Manuel ke qoder/qfmodel dan terbukti MEMANGGIL tool
 *  (uji 2026-09-26: tool_calls=true). Kalau target kembali ke kimi-web, isi lagi set ini. */
export const TOOLLESS_MODELS = new Set<string>([]);

export const MODEL_BADGE: Record<string, string> = {
  "onheil-1.1-luna": "",
  "onheil-1.1-aria": "",
  "onheil-1.5-selenia": "Pro",
  "onheil-2-asteria": "Pro",
  "claude-opus-5-5": "Max",
  "claude-fable-5-1": "Max",
};

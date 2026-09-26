// language: TypeScript, file: lib/plans.ts, target: hak akses model per paket (client & server)
/**
 * Paket (permintaan Manuel, 2026-09-24):
 *   free -> onheil-1.1-luna
 *   pro  -> + onheil-1.5-selenia
 *   max  -> + onheil-2-asteria, onheil-2.5-celestia, onheil-3-istaroth (permintaan Manuel, 2026-09-25)
 * Paket efektif = paket dari langganan aktif, kalau tidak ada -> paket bawaan akun.
 */
export type Plan = "free" | "pro" | "max";

export const PLANS: { id: Plan; label: string }[] = [
  { id: "free", label: "Standard" },
  { id: "pro", label: "Pro" },
  { id: "max", label: "Max" },
];

export const MODEL_LABELS: Record<string, string> = {
  "onheil-1.1-luna": "Onheil 1.1 Luna",
  "onheil-1.1-aria": "Onheil 1.1 Aria",
  "onheil-1.5-selenia": "Onheil 1.5 Selenia",
  "onheil-1.5-solaria": "Onheil 1.5 Solaria",
  "onheil-2-asteria": "Onheil 2 Asteria",
  "onheil-2.5-celestia": "Onheil 2.5 Celestia",
  "onheil-3-istaroth": "Onheil 3 Istaroth",
};

const RANK: Record<Plan, number> = { free: 0, pro: 1, max: 2 };

export const PLAN_MODELS: Record<Plan, string[]> = {
  free: ["onheil-1.1-luna", "onheil-1.1-aria"],
  pro: ["onheil-1.1-luna", "onheil-1.1-aria", "onheil-1.5-selenia", "onheil-1.5-solaria"],
  max: [
    "onheil-1.1-luna",
    "onheil-1.1-aria",
    "onheil-1.5-selenia",
    "onheil-1.5-solaria",
    "onheil-2-asteria",
    "onheil-2.5-celestia",
    "onheil-3-istaroth",
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
  "onheil-1.5-solaria": "Pro",
  "onheil-2-asteria": "Max",
  "onheil-2.5-celestia": "Max",
  "onheil-3-istaroth": "Max",
};

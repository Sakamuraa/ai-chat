// language: TypeScript, file: lib/subscriptions.ts, target: Vercel Node runtime — kuota + kode langganan
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { dailyTokenLimit, type QuotaState } from "./quota";
import { allowedModels, effectivePlan, type Plan } from "./plans";

export { TOKEN_OPTIONS, DURATION_OPTIONS } from "./sub-options";
import { TOKEN_OPTIONS, DURATION_OPTIONS } from "./sub-options";

export type SubRow = {
  token_limit: number | null;
  remaining: number | null;
  valid_until: string;
  source_code: string | null;
  plan?: string | null;
};

export type CodeRow = {
  code: string;
  token_limit: number | null;
  duration_hours: number;
  plan: string | null;
  created_at: string;
  revoked: boolean;
  redeemed_at: string | null;
  redeemed_by: string | null;
  redeemer: string | null;
};

/** Ambil status kuota user: pemakaian hari ini (UTC) + langganan aktif terbaru. */
export type QuotaStateEx = QuotaState & { plan: Plan; models: string[] };

export async function quotaState(userId: string): Promise<QuotaStateEx> {
  const usage = (await db()`
    SELECT COALESCE(tokens, 0)::bigint AS tokens
    FROM token_usage WHERE user_id = ${userId} AND day = (now() AT TIME ZONE 'utc')::date
  `) as unknown as { tokens: number | string }[];

  const acct = (await db()`
    SELECT plan::text AS plan FROM users WHERE id = ${userId}
  `) as unknown as { plan: string }[];

  const sub = (await db()`
    SELECT token_limit, remaining, valid_until::text AS valid_until, source_code, plan::text AS plan
    FROM user_subs
    WHERE user_id = ${userId} AND valid_until > now()
    ORDER BY valid_until DESC
    LIMIT 1
  `) as unknown as (SubRow & { plan: string | null })[];

  const plan = effectivePlan(acct[0]?.plan, sub[0]?.plan, sub[0]?.valid_until);
  return {
    dailyUsed: Number(usage[0]?.tokens ?? 0),
    dailyLimit: dailyTokenLimit(),
    plan,
    models: allowedModels(plan),
    sub: sub[0]
      ? {
          tokenLimit: sub[0].token_limit === null ? null : Number(sub[0].token_limit),
          remaining: sub[0].remaining === null ? null : Number(sub[0].remaining),
          validUntil: sub[0].valid_until,
        }
      : null,
  };
}

/** Catat pemakaian token hari ini + menyusutkan sisa langganan (kalau berbasis token). */
export async function addUsage(userId: string, tokens: number): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  const n = Math.round(tokens);
  await db()`
    INSERT INTO token_usage (user_id, day, tokens)
    VALUES (${userId}, (now() AT TIME ZONE 'utc')::date, ${n})
    ON CONFLICT (user_id, day) DO UPDATE SET tokens = token_usage.tokens + ${n}
  `;
  await db()`
    UPDATE user_subs SET remaining = GREATEST(0, remaining - ${n})
    WHERE user_id = ${userId} AND valid_until > now() AND remaining IS NOT NULL
  `;
}

function genCode(): string {
  // 64 bit acak (4+4 byte) — tebakan butuh 2^64 percobaan
  return `ONHIL-${randomBytes(4).toString("hex").toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Buat satu kode langganan (hanya admin). token_limit null = unlimited. */
export async function createCode(
  adminId: string,
  tokenLimit: number | null,
  durationHours: number,
  plan: Plan,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    try {
      const rows = (await db()`
        INSERT INTO sub_codes (code, token_limit, duration_hours, created_by, plan)
        VALUES (${code}, ${tokenLimit}, ${durationHours}, ${adminId}, ${plan})
        RETURNING code
      `) as unknown as { code: string }[];
      if (rows[0]) return rows[0].code;
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // tabrakan kode -> coba lagi
    }
  }
  throw new Error("code generation failed");
}

export async function listCodes(): Promise<CodeRow[]> {
  return (await db()`
    SELECT c.code, c.token_limit, c.duration_hours, c.plan::text AS plan,
           c.created_at::text AS created_at,
           c.revoked, c.redeemed_at::text AS redeemed_at, c.redeemed_by,
           u.username AS redeemer
    FROM sub_codes c
    LEFT JOIN users u ON u.id = c.redeemed_by
    ORDER BY c.created_at DESC
    LIMIT 200
  `) as unknown as CodeRow[];
}

export type RedeemResult =
  | { ok: true; sub: SubRow }
  | { ok: false; error: "not_found" | "used" | "revoked" };

/** Tukar kode -> langganan aktif. UPDATE bersyarat supaya tabrakan redeem aman. */
export async function redeem(code: string, userId: string): Promise<RedeemResult> {
  const trimmed = code.trim().toUpperCase();

  const rows = (await db()`
    UPDATE sub_codes
    SET redeemed_by = ${userId}, redeemed_at = now()
    WHERE code = ${trimmed} AND redeemed_by IS NULL AND revoked = false
    RETURNING token_limit, duration_hours, plan::text AS plan
  `) as unknown as { token_limit: number | null; duration_hours: number; plan: string | null }[];

  if (rows[0]) {
    const { token_limit, duration_hours, plan } = rows[0];
    const ins = (await db()`
      INSERT INTO user_subs (user_id, source_code, token_limit, remaining, valid_until, plan)
      VALUES (${userId}, ${trimmed}, ${token_limit}, ${token_limit},
              now() + make_interval(hours => ${duration_hours}), ${plan})
      RETURNING token_limit, remaining, valid_until::text AS valid_until, source_code, plan::text AS plan
    `) as unknown as SubRow[];
    return { ok: true, sub: ins[0] };
  }

  const check = (await db()`
    SELECT revoked, redeemed_by FROM sub_codes WHERE code = ${trimmed}
  `) as unknown as { revoked: boolean; redeemed_by: string | null }[];

  if (!check[0]) return { ok: false, error: "not_found" };
  if (check[0].revoked) return { ok: false, error: "revoked" };
  return { ok: false, error: "used" };
}

/** Cabut kode yang belum dipakai (admin). */
export async function revokeCode(code: string): Promise<boolean> {
  const rows = (await db()`
    UPDATE sub_codes SET revoked = true
    WHERE code = ${code} AND redeemed_by IS NULL AND revoked = false
    RETURNING code
  `) as unknown as { code: string }[];
  return rows.length > 0;
}

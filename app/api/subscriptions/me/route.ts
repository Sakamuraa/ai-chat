// language: TypeScript, file: app/api/subscriptions/me/route.ts, target: status kuota dua jendela + langganan sendiri
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { quotaState } from "@/lib/subscriptions";
import { checkQuota, remainingWindows } from "@/lib/quota";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await quotaState(user.id);
  const verdict = checkQuota(state);
  const rem = remainingWindows(state);

  return NextResponse.json({
    plan: state.plan,
    models: state.models,
    // jendela ala Claude: 5 jam + mingguan
    fiveHour: {
      limit: state.fiveHourLimit,
      used: state.fiveHourUsed,
      remaining: Number.isFinite(rem.fiveHour) ? rem.fiveHour : null,
    },
    weekly: {
      limit: state.weeklyLimit,
      used: state.weeklyUsed,
      remaining: Number.isFinite(rem.weekly) ? rem.weekly : null,
    },
    // kompatibilitas UI lama (profil) — isinya kini jendela 5 jam
    dailyLimit: state.fiveHourLimit,
    dailyUsed: state.fiveHourUsed,
    remaining: Number.isFinite(rem.fiveHour) ? rem.fiveHour : null,
    unlimited: rem.fiveHour === Infinity,
    quota: verdict,
    sub: state.sub,
  });
}

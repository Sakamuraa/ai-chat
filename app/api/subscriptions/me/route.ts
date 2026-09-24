// language: TypeScript, file: app/api/subscriptions/me/route.ts, target: status kuota + langganan sendiri
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { quotaState } from "@/lib/subscriptions";
import { checkQuota, remainingToday } from "@/lib/quota";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await quotaState(user.id);
  const verdict = checkQuota(state);
  const remaining = remainingToday(state);

  return NextResponse.json({
    dailyLimit: state.dailyLimit,
    dailyUsed: state.dailyUsed,
    remaining: Number.isFinite(remaining) ? remaining : null,
    unlimited: remaining === Infinity,
    quota: verdict,
    sub: state.sub,
  });
}

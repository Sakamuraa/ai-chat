// language: TypeScript, file: app/api/subscriptions/redeem/route.ts, target: tukar kode langganan
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { redeem } from "@/lib/subscriptions";
import { allow, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({ code: z.string().min(6).max(64) });

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 10 percobaan / 10 menit per akun & per IP — kode 64 bit + pembatas ini menutup bruteforce
  if (!allow(`redeem-user:${user.id}`, 10) || !allow(`redeem-ip:${clientIp(req.headers)}`, 20)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const result = await redeem(parsed.data.code, user.id);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 409;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ sub: result.sub }, { status: 200 });
}

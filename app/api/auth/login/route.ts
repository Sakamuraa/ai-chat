// language: TypeScript, file: app/api/auth/login/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(128) });

export async function POST(req: Request) {
  if (!allow(`login:${clientIp(req.headers)}`, 10)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const rows = (await db()`
    SELECT id, pass_hash FROM users WHERE username = ${parsed.data.username}
  `) as unknown as { id: string; pass_hash: string }[];

  // pesan error sama untuk "tidak ada" dan "salah" — jangan bocorkan keberadaan akun
  if (!rows[0] || !verifyPassword(parsed.data.password, rows[0].pass_hash)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  const token = await createSessionToken(rows[0].id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

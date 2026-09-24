// language: TypeScript, file: app/api/auth/login/route.ts, target: masuk dengan email + password
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().min(1, "Isi email").max(254),
  password: z.string().min(1, "Isi password").max(128),
});

export async function POST(req: Request) {
  if (!allow(`login:${clientIp(req.headers)}`, 10)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const id = parsed.data.email.trim();
  // email utama; username lama tetap diterima agar akun lama tak terkunci
  const rows = (await (id.includes("@")
    ? db()`SELECT id, pass_hash, email_verified, email FROM users WHERE lower(email) = lower(${id})`
    : db()`SELECT id, pass_hash, email_verified, email FROM users WHERE username = ${id}`)) as unknown as {
    id: string;
    pass_hash: string;
    email_verified: boolean;
    email: string | null;
  }[];

  const user = rows[0];
  if (!user || !verifyPassword(parsed.data.password, user.pass_hash)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  if (user.email && !user.email_verified) {
    return NextResponse.json({ error: "verify_required", email: user.email }, { status: 403 });
  }

  const token = await createSessionToken(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

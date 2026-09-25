// language: TypeScript, file: app/api/auth/verify/route.ts, target: konfirmasi kode OTP -> akun aktif + sesi
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSessionToken, issueSessionCookie } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email("Email tidak valid"),
  code: z.string().regex(/^\d{6}$/, "Kode 6 angka"),
});

export async function POST(req: Request) {
  if (!allow(`verify:${clientIp(req.headers)}`, 15)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues[0]?.message }, { status: 400 });

  const check = await verifyOtp(parsed.data.email, parsed.data.code);
  if (!check.ok) return NextResponse.json({ error: check.reason ?? "wrong" }, { status: 400 });

  const rows = (await db()`
    UPDATE users SET email_verified = true
    WHERE lower(email) = lower(${parsed.data.email})
    RETURNING id
  `) as unknown as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = await createSessionToken(rows[0].id);
  const res = NextResponse.json({ ok: true });
  await issueSessionCookie(res, token, rows[0].id);
  return res;
}

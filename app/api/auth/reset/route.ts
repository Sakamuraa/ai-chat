// language: TypeScript, file: app/api/auth/reset/route.ts, target: lupa password -> kode OTP + password baru
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rate-limit";
import { verifyOtp } from "@/lib/otp";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email("Email tidak valid"),
  code: z.string().regex(/^\d{6}$/, "Kode 6 angka"),
  password: z.string().min(8, "Password minimal 8 karakter").max(128),
});

export async function POST(req: Request) {
  if (!allow(`reset:${clientIp(req.headers)}`, 10)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const check = await verifyOtp(parsed.data.email, parsed.data.code);
  if (!check.ok) return NextResponse.json({ error: check.reason ?? "wrong" }, { status: 400 });

  const rows = (await db()`
    UPDATE users SET pass_hash = ${hashPassword(parsed.data.password)}
    WHERE lower(email) = lower(${parsed.data.email})
    RETURNING id
  `) as unknown as { id: string }[];
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // cabut sesi lama supaya pakai password baru untuk masuk lagi
  await db()`DELETE FROM auth_tokens WHERE user_id = ${rows[0].id}`;
  return NextResponse.json({ ok: true });
}

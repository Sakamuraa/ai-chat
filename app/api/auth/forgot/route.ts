// language: TypeScript, file: app/api/auth/forgot/route.ts, target: lupa password -> kirim OTP (tanpa bocor keberadaan akun)
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { allow, clientIp } from "@/lib/rate-limit";
import { createOtp, otpRecentlyCreated } from "@/lib/otp";
import { mailReady, sendOtpEmail } from "@/lib/mail";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email("Email tidak valid") });

export async function POST(req: Request) {
  if (!allow(`forgot:${clientIp(req.headers)}`, 6)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const email = parsed.data.email;

  const rows = (await db()`
    SELECT 1 FROM users WHERE lower(email) = lower(${email})
  `) as unknown as unknown[];
  // jawaban sama walau akun tidak ada — jangan bocorkan keberadaan email
  if (rows.length === 0) return NextResponse.json({ ok: true });
  if (await otpRecentlyCreated(email)) return NextResponse.json({ error: "throttled" }, { status: 429 });

  const code = await createOtp(email);
  if (!mailReady()) {
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true, devCode: code });
    return NextResponse.json({ error: "mail_not_configured" }, { status: 503 });
  }
  try {
    await sendOtpEmail(email, code);
  } catch (e) {
    return NextResponse.json({ error: "mail_failed", detail: (e as Error).message.slice(0, 120) }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

// language: TypeScript, file: app/api/auth/resend/route.ts, target: kirim ulang kode OTP (maks 1x/menit)
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { allow, clientIp } from "@/lib/rate-limit";
import { createOtp, otpRecentlyCreated } from "@/lib/otp";
import { mailReady, sendOtpEmail } from "@/lib/mail";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email("Email tidak valid") });

export async function POST(req: Request) {
  if (!allow(`resend:${clientIp(req.headers)}`, 6)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const email = parsed.data.email;

  const pending = (await db()`
    SELECT 1 FROM users WHERE lower(email) = lower(${email}) AND email_verified = false
  `) as unknown as unknown[];
  if (pending.length === 0) return NextResponse.json({ error: "not_pending" }, { status: 404 });
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

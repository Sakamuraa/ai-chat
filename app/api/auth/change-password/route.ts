// language: TypeScript, file: app/api/auth/change-password/route.ts, target: ganti password wajib OTP ke email
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser, hashPassword } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rate-limit";
import { createOtp, verifyOtp } from "@/lib/otp";
import { mailReady, sendOtpEmail } from "@/lib/mail";

export const runtime = "nodejs";

const Send = z.object({ action: z.literal("send") });
const Apply = z.object({
  code: z.string().regex(/^\d{6}$/, "Kode 6 angka"),
  password: z.string().min(8, "Password minimal 8 karakter").max(128),
});

async function sessionEmail(): Promise<{ email: string } | { error: string; status: number }> {
  const user = await getSessionUser();
  if (!user) return { error: "unauthorized", status: 401 };
  const rows = (await db()`SELECT email FROM users WHERE id = ${user.id}`) as unknown as { email: string | null }[];
  if (!rows[0]?.email) return { error: "no_email", status: 400 };
  return { email: rows[0].email };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  // langkah 1: kirim kode
  if (Send.safeParse(body).success) {
    if (!allow(`cp-send:${clientIp(req.headers)}`, 6)) {
      return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    }
    const ctx = await sessionEmail();
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const code = await createOtp(ctx.email);
    if (mailReady()) {
      try {
        await sendOtpEmail(ctx.email, code);
      } catch (e) {
        return NextResponse.json({ error: "mail_failed", detail: (e as Error).message.slice(0, 120) }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }
    if (process.env.NODE_ENV !== "production") return NextResponse.json({ ok: true, devCode: code });
    return NextResponse.json({ error: "mail_not_configured" }, { status: 503 });
  }

  // langkah 2: verifikasi kode + simpan password baru
  if (!allow(`cp-apply:${clientIp(req.headers)}`, 10)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }
  const parsed = Apply.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const ctx = await sessionEmail();
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const check = await verifyOtp(ctx.email, parsed.data.code);
  if (!check.ok) return NextResponse.json({ error: check.reason ?? "wrong" }, { status: 400 });

  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db()`UPDATE users SET pass_hash = ${hashPassword(parsed.data.password)} WHERE id = ${user.id}`;
  return NextResponse.json({ ok: true });
}

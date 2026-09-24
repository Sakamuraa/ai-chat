// language: TypeScript, file: app/api/auth/register/route.ts, target: daftar dengan nickname + email + password, verifikasi OTP
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rate-limit";
import { createOtp } from "@/lib/otp";
import { mailReady, sendOtpEmail } from "@/lib/mail";

export const runtime = "nodejs";

const Body = z
  .object({
    nickname: z.string().min(3, "Nickname minimal 3 karakter").max(32, "Nickname maksimal 32 karakter"),
    email: z.string().email("Email tidak valid").max(254),
    password: z.string().min(8, "Password minimal 8 karakter").max(128),
    confirm: z.string().min(1, "Ulangi password"),
  })
  .refine((v) => v.password === v.confirm, { message: "Password tidak sama", path: ["confirm"] });

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
}

export async function POST(req: Request) {
  if (!allow(`register:${clientIp(req.headers)}`, 10)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { nickname, email, password } = parsed.data;

  const dupEmail = (await db()`SELECT 1 FROM users WHERE lower(email) = lower(${email})`) as unknown as unknown[];
  if (dupEmail.length > 0) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  // username tetap ada demi kolom lama & tautan lama — turunan dari email/nickname
  const root = slug(email.split("@")[0]) || slug(nickname) || "user";
  let username = root;
  for (let i = 1; i < 30; i++) {
    const rows = (await db()`SELECT 1 FROM users WHERE username = ${username}`) as unknown as unknown[];
    if (rows.length === 0) break;
    username = `${root}${i + 1}`;
  }

  let rows: { id: string }[] = [];
  try {
    rows = (await db()`
      INSERT INTO users (username, pass_hash, is_admin, email, nickname, provider, email_verified)
      VALUES (${username}, ${hashPassword(password)}, NOT EXISTS (SELECT 1 FROM users),
              lower(${email}), ${nickname}, 'local', false)
      RETURNING id
    `) as unknown as { id: string }[];
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return NextResponse.json({ error: "email_taken" }, { status: 409 });
    throw e;
  }
  if (!rows[0]) return NextResponse.json({ error: "email_taken" }, { status: 409 });

  const code = await createOtp(email);
  if (mailReady()) {
    try {
      await sendOtpEmail(email, code);
    } catch (e) {
      return NextResponse.json({ error: "mail_failed", detail: (e as Error).message.slice(0, 120) }, { status: 502 });
    }
  } else if (process.env.NODE_ENV !== "production") {
    // pengembalian lokal tanpa SMTP: kode diserahkan ke UI (tidak pernah di produksi)
    return NextResponse.json({ ok: true, verify: email, devCode: code });
  } else {
    return NextResponse.json({ error: "mail_not_configured" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, verify: email });
}

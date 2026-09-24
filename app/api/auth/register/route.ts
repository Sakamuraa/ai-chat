// language: TypeScript, file: app/api/auth/register/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { allow, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .max(32, "Username maksimal 32 karakter")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username hanya boleh huruf, angka, _ . -"),
  password: z
    .string()
    .min(8, "Password minimal 8 karakter")
    .max(128, "Password maksimal 128 karakter"),
});

export async function POST(req: Request) {
  if (!allow(`register:${clientIp(req.headers)}`, 10)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", detail: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { username, password } = parsed.data;

  let rows: { id: string }[];
  try {
    rows = (await db()`
      INSERT INTO users (username, pass_hash, is_admin)
      SELECT ${username}, ${hashPassword(password)}, NOT EXISTS (SELECT 1 FROM users)
      ON CONFLICT (username) DO NOTHING
      RETURNING id
    `) as unknown as { id: string }[];
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "23505") return NextResponse.json({ error: "username_taken" }, { status: 409 });
    throw e;
  }

  if (!rows[0]) return NextResponse.json({ error: "username_taken" }, { status: 409 });

  const token = await createSessionToken(rows[0].id);
  const res = NextResponse.json({ ok: true, id: rows[0].id });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

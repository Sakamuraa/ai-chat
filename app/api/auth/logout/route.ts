// language: TypeScript, file: app/api/auth/logout/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { destroySessionToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (raw) await destroySessionToken(raw);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

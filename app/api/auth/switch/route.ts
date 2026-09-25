// language: TypeScript (Next.js), file: app/api/auth/switch/route.ts, target: pindah akun sesaat
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  ACCOUNT_HANDLE_COOKIE,
  SESSION_COOKIE,
  createSessionToken,
  getSessionUser,
  sessionCookieOptions,
} from "@/lib/auth";
import { allow } from "@/lib/rate-limit";

const Body = z.object({ userId: z.string().uuid() });

/**
 * Pindah ke akun lain yang tercatat di perangkat ini.
 * Token baru dibuat untuk akun tujuan; akun sebelumnya tetap tercatat, jadi bolak-balik bebas.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!allow(`switch:${user.id}`, 20)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { userId } = parsed.data;

  const store = await cookies();
  const handle = store.get(ACCOUNT_HANDLE_COOKIE)?.value ?? "";
  if (!handle) return NextResponse.json({ error: "no_slots" }, { status: 403 });

  const slot = (await db()`
    SELECT 1 FROM account_slots WHERE handle = ${handle} AND user_id = ${userId}
  `) as unknown as { "?column?": number }[];
  if (!slot[0]) return NextResponse.json({ error: "slot_not_found" }, { status: 403 });

  await db()`UPDATE account_slots SET last_used = now() WHERE handle = ${handle} AND user_id = ${userId}`;
  const token = await createSessionToken(userId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}

// language: TypeScript, file: app/api/gate/route.ts, target: verifikasi password gate (tahap pengembangan)
// HAPUS bersama /gate dan blok GATE di proxy.ts saat rilis.
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** SHA-256 dari password gate — nilai yang juga ditaruh di cookie oleh proxy.ts. */
const GATE_HASH = "875e8b82b5c01fca0973ea93a946a81678d6b84d029a186659cc5b52449481e4";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const hash = await sha256Hex(String(body.password ?? ""));
  if (hash !== GATE_HASH) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("gate", GATE_HASH, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 hari — cukup untuk masa pengembangan
  });
  return res;
}

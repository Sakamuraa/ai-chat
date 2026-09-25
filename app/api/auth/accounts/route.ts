// language: TypeScript (Next.js), file: app/api/auth/accounts/route.ts, target: daftar akun switch-account
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ACCOUNT_HANDLE_COOKIE, getSessionUser } from "@/lib/auth";

/** Daftar akun yang pernah login di peramban ini (untuk menu Ganti akun). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const store = await cookies();
  const handle = store.get(ACCOUNT_HANDLE_COOKIE)?.value ?? "";
  if (!handle) return NextResponse.json({ accounts: [] });

  const rows = (await db()`
    SELECT s.user_id AS id, u.username, u.email, u.avatar_url, s.last_used
    FROM account_slots s
    JOIN users u ON u.id = s.user_id
    WHERE s.handle = ${handle}
    ORDER BY s.last_used DESC
    LIMIT 8
  `) as unknown as { id: string; username: string; email: string | null; avatar_url: string | null }[];

  return NextResponse.json({
    accounts: rows.map((r) => ({
      id: r.id,
      username: r.username,
      email: r.email,
      avatarUrl: r.avatar_url,
      current: r.id === user.id,
    })),
  });
}

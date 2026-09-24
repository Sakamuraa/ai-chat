// language: TypeScript, file: app/api/subscriptions/codes/[code]/route.ts, target: cabut kode (admin)
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { revokeCode } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { code } = await ctx.params;
  const ok = await revokeCode(decodeURIComponent(code));
  if (!ok) return NextResponse.json({ error: "not_revocable" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

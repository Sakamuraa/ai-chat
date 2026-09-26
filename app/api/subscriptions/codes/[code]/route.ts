// language: TypeScript, file: app/api/subscriptions/codes/[code]/route.ts, target: cabut/hapus kode (admin)
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { revokeCode, removeCode } from "@/lib/subscriptions";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!user.is_admin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { code } = await ctx.params;
  const decoded = decodeURIComponent(code);
  const url = new URL(req.url);
  if (url.searchParams.get("remove") === "true") {
    const ok = await removeCode(decoded);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 409 });
    return NextResponse.json({ ok: true });
  }
  const ok = await revokeCode(decoded);
  if (!ok) return NextResponse.json({ error: "not_revocable" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

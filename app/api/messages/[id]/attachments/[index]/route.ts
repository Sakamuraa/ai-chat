// language: TypeScript, file: app/api/messages/[id]/attachments/[index]/route.ts, target: Vercel Node runtime
// Sajian lampiran terpisah: base64 besar tidak lagi ikut HTML/JSON.
// Boleh: pemilik sesi, ATAU sesi yang share_enabled (tautan bagikan bersifat publik).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type Att = { name: string; kind: "image" | "text"; mime: string; data: string };

type Ctx = { params: Promise<{ id: string; index: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id, index } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx > 50) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = (await db()`
    SELECT m.id, m.attachments, s.share_enabled, s.user_id
    FROM messages m JOIN sessions s ON s.id = m.session_id
    WHERE m.id = ${id}
  `) as unknown as {
    attachments: Att[] | null;
    share_enabled: boolean;
    user_id: string;
  }[];
  const row = rows[0];
  const att = (row?.attachments ?? [])[idx];
  if (!row || !att) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const user = await getSessionUser();
  const allowed = (user && user.id === row.user_id) || row.share_enabled === true;
  // 404 (bukan 403) supaya keberadaan sesi orang lain tak bocor lewat endpoint ini
  if (!allowed) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let type = att.mime || "application/octet-stream";
  let body: BodyInit;

  if (att.data.startsWith("data:")) {
    const comma = att.data.indexOf(",");
    const header = att.data.slice(5, comma > 0 ? comma : undefined);
    type = header.split(";")[0] || type;
    body = Buffer.from(att.data.slice(comma + 1), "base64") as unknown as BodyInit;
  } else {
    body = att.data;
    if (!type.startsWith("text/") && type !== "application/pdf") type = "text/plain";
  }

  return new NextResponse(body, {
    headers: {
      "content-type": type,
      "content-disposition": `inline; filename="${att.name.replace(/["\\]/g, "")}"`,
      "cache-control": "private, max-age=3600",
    },
  });
}

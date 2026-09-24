// language: TypeScript, file: app/api/files/[id]/route.ts, target: unduh berkas hasil create_file (hanya pemilik)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = (await db()`
    SELECT name, mime, encode(data, 'base64') AS b64
    FROM generated_files WHERE id = ${id} AND user_id = ${user.id}
  `) as unknown as { name: string; mime: string; b64: string }[];
  if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const bytes = Buffer.from(rows[0].b64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": rows[0].mime,
      "content-length": String(bytes.length),
      "content-disposition": `attachment; filename="${rows[0].name.replace(/"/g, "")}"`,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

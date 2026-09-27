// language: TypeScript, file: app/api/files/[id]/route.ts, target: unduh/preview berkas hasil create_file & render_mermaid
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isUuid } from "@/lib/uuid";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = (await db()`
    SELECT name, mime, encode(data, 'base64') AS b64, user_id
    FROM generated_files WHERE id = ${id}
  `) as unknown as { name: string; mime: string; b64: string; user_id: string }[];
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // gambar (diagram hasil render_mermaid, dll) boleh diakses publik — URL ber-UUID acak
  // dan wajib tampil di halaman session sharing tanpa cookie; berkas lain tetap pemilik saja
  const isImage = row.mime.startsWith("image/");
  if (!isImage) {
    const user = await getSessionUser();
    if (!user || user.id !== row.user_id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const bytes = Buffer.from(row.b64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": row.mime,
      "content-length": String(bytes.length),
      // gambar: inline supaya <img> dan preview langsung tampil; berkas lain: unduh
      "content-disposition": isImage
        ? "inline"
        : `attachment; filename="${row.name.replace(/"/g, "")}"`,
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

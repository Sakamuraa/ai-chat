// language: TypeScript, file: lib/tools/diagram.ts, target: render diagram Mermaid jadi gambar PNG/JPEG nyata
import { db } from "@/lib/db";
import { deflateSync } from "node:zlib";
import type { ToolDef, ToolResult } from "./types";

const MAX_CODE = 20_000;
const MAX_BYTES = 12_000_000;

/** mermaid.ink menerima base64url dari kode mermaid apa adanya (teruji 200 + image/jpeg). */
function inkUrl(code: string): string {
  return `https://mermaid.ink/img/${Buffer.from(code, "utf8").toString("base64url")}`;
}

/** Link editor mermaid.live dgn state ter-encode (zlib-deflate + base64) — diagram langsung terbuka. */
function editorLink(code: string): string {
  try {
    const packed = deflateSync(
      Buffer.from(JSON.stringify({ code, mermaid: "11.4.0", autoSync: true, updateDiagram: true }), "utf8"),
    ).toString("base64");
    return `https://mermaid.live/editor#pako:${packed}`;
  } catch {
    return "https://mermaid.live";
  }
}

const render: ToolDef = {
  name: "render_mermaid",
  description:
    "Render diagram Mermaid (flowchart, sequence, class, ER, state, use case/UML, pie, gantt, mindmap) menjadi GAMBAR nyata. " +
    "Setelah sukses, TAMPILKAN di jawaban sebagai Markdown: ![judul diagram](URL) memakai URL absolut persis dari hasil tool. " +
    "Pakai ini setiap kali user minta diagram/flowchart/visualisasi — jangan mengirim kode mentah sebagai teks.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "Kode Mermaid lengkap, diawali tipe diagram (flowchart TD, sequenceDiagram, dst)" },
      title: { type: "string", description: "Judul/alt text diagram, dipakai untuk nama berkas" },
    },
    required: ["code"],
  },
  enabled: () => Boolean(process.env.DATABASE_URL),
  execute: async (args, ctx): Promise<ToolResult> => {
    const code = String(args.code ?? "").trim();
    const title = String(args.title ?? "").trim().slice(0, 120) || "diagram";
    if (!code) return { ok: false, error: "code kosong" };
    if (code.length > MAX_CODE) return { ok: false, error: `kode terlalu panjang (maks ${MAX_CODE} karakter)` };

    let res: Response;
    try {
      res = await fetch(inkUrl(code), { signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      return { ok: false, error: `layanan render tidak terjangkau: ${(e as Error).message}` };
    }
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: `mermaid.ink menolak diagram (${res.status}): ${detail}` };
    }
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.startsWith("image/")) return { ok: false, error: `balasan bukan gambar: ${ctype}` };

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) return { ok: false, error: "gambar terlalu besar (maks 12 MB)" };

    const ext = ctype.includes("png") ? "png" : "jpg";
    const mime = ext === "png" ? "image/png" : "image/jpeg";
    const safeName = `${title.replace(/[\\/:*?"<>|]/g, " ").slice(0, 80)}.${ext}`;

    const rows = (await db()`
      INSERT INTO generated_files (user_id, name, mime, data)
      VALUES (${ctx.userId}, ${safeName}, ${mime}, decode(${bytes.toString("base64")}, 'base64'))
      RETURNING id
    `) as unknown as { id: string }[];
    const id = rows[0]?.id;
    if (!id) return { ok: false, error: "gagal menyimpan gambar" };

    const url = `${ctx.origin ?? ""}/api/files/${id}`;
    const editor = editorLink(code);
    return {
      ok: true,
      fileUrl: url,
      fileName: safeName,
      text:
        `Diagram Mermaid "${title}" dirender (${ext.toUpperCase()}, ${(bytes.length / 1024).toFixed(0)} KB). ` +
        `Tampilkan di jawaban dengan Markdown: ![${title}](${url}) — URL absolut, salin persis. ` +
        `Buka/edit di mermaid.live: ${editor}`,
    };
  },
};

export const DIAGRAM_TOOLS: ToolDef[] = [render];

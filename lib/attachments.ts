// language: TypeScript, file: lib/attachments.ts, target: klasifikasi lampiran (dipakai client & tes)
export type Attachment = { name: string; kind: "image" | "text"; mime: string; data: string };

export const MAX_MB = 5;

/** Ekstensi teks yang boleh dikirim utuh; sisanya dianggap tidak didukung. */
export const TEXT_EXTS = [
  "md", "txt", "csv", "log", "json", "yaml", "yml", "js", "jsx", "ts", "tsx",
  "py", "go", "rs", "java", "c", "cpp", "h", "sh", "sql", "html", "css",
  "xml", "ini", "env", "toml", "cfg", "conf",
];

export type FileClass = "image" | "text" | "unsupported";

/** Dokumen Office yang diekstrak teksnya di klien (ZIP tanpa dependensi). */
export const DOC_EXTS = ["docx", "xlsx"];

export function isDocFile(name: string): boolean {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return DOC_EXTS.includes(ext);
}

export function classifyFile(name: string, mime: string): FileClass {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  if (
    ["application/json", "application/xml", "application/yaml", "application/javascript"].includes(mime)
  ) {
    return "text";
  }
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (DOC_EXTS.includes(ext)) return "text"; // teks diekstrak oleh extractDocText
  return TEXT_EXTS.includes(ext) ? "text" : "unsupported";
}

/** Batas data yang boleh dibawa inline dalam HTML/API: di atas ini
 *  base64 ditarik dan dilayani terpisah lewat /api/messages/<id>/attachments/<i>
 *  (alasan halaman bagikan bisa menyentuh 8 MB). */
export const INLINE_LIMIT = 20_000;

export function slimAttachments(
  list: { name: string; kind: "image" | "text"; mime: string; data: string }[] | null | undefined,
): { name: string; kind: "image" | "text"; mime: string; data: string }[] {
  if (!list) return [];
  return list.map((a) => ({
    name: a.name,
    kind: a.kind,
    mime: a.mime,
    data: a.data && a.data.length > INLINE_LIMIT ? "" : a.data,
  }));
}

/**
 * Upstream vision TERBUTI buta pada gambar sangat kecil (uji hitam-putih 2026-09-25,
 * model onheil-1.1-luna, stream=true, merah solid 18 kali per ukuran):
 *   8px  -> 0 benar (16 kosong, 2 salah 'Putih')
 *   32px -> 0 benar (16 kosong, 2 salah 'Putih')
 *   64px -> 16 benar / 18     128px -> 14 benar / 18
 * Ambang praktis = sisi terpendek 64px. Gambar kecil dinaikkan ke minSide dengan
 * nearest-neighbour (piksel asli utuh) — terbukti: 8px -> 128px = 15/16 benar.
 * Dipanggil di sisi klien; aman dipanggil saat dataUrl sudah besar (no-op).
 */
export async function upscaleTiny(dataUrl: string, minSide = 128): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("gagal_baca_gambar"));
      i.src = dataUrl;
    });
    const short = Math.min(img.naturalWidth, img.naturalHeight);
    if (!short || short >= minSide) return dataUrl;
    const k = minSide / short;
    const w = Math.max(minSide, Math.round(img.naturalWidth * k));
    const h = Math.max(minSide, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.imageSmoothingEnabled = false; // nearest -> blok piksel asli dipertahankan
    ctx.drawImage(img, 0, 0, w, h);
    const out = c.toDataURL("image/png");
    return out.length <= 1_200_000 ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}

/** Kecilkan gambar sisi klien sampai pasti muat TARGET (1,2 jt karakter base64).
 *  Dulu cuma chat-view yang memakai; halaman landing mengirim mentah -> foto 2,6 MB
 *  jadi ~3,5 jt karakter, lewat batas server (1,5 jt) -> gambar dilepas dan model
 *  menjawab "kirim gambarnya" (laporan Manuel, 2026-09-26). Kini dua pintu sama. */
export async function compressImage(file: File): Promise<string> {
  const TARGET = 1_200_000;
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
  if (typeof document === "undefined") return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("gagal_baca_gambar"));
      i.src = dataUrl;
    });
    if (dataUrl.length <= TARGET) return dataUrl;
    for (const maxSide of [1600, 1280, 1024, 800]) {
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.drawImage(img, 0, 0, w, h);
      for (const q of [0.8, 0.65, 0.5, 0.4]) {
        const out = canvas.toDataURL("image/jpeg", q);
        if (out.startsWith("data:image/jpeg;base64,") && out.length <= TARGET) return out;
      }
    }
    const scale = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
    const last = document.createElement("canvas");
    last.width = Math.max(1, Math.round(img.naturalWidth * scale));
    last.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx2 = last.getContext("2d");
    if (ctx2) {
      ctx2.drawImage(img, 0, 0, last.width, last.height);
      return last.toDataURL("image/jpeg", 0.4);
    }
    return dataUrl;
  } catch {
    return dataUrl;
  }
}


// ---------------------------------------------------------------------------
// Ekstrak teks .docx / .xlsx di klien. Format keduanya ZIP: baca central
// directory, inflate entry yang diinginkan dengan DecompressionStream
// ("deflate-raw") — tanpa dependensi ekstra. Gagal -> null (ditolak UI).
// ---------------------------------------------------------------------------
async function zipInflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type ZipEntry = { name: string; method: number; compSize: number; local: number };

function zipEntries(u8: Uint8Array, dv: DataView): ZipEntry[] {
  const out: ZipEntry[] = [];
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count && off + 46 <= u8.length; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const local = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
    out.push({ name, method, compSize, local });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}

async function zipReadEntry(u8: Uint8Array, dv: DataView, e: ZipEntry): Promise<string> {
  const lNameLen = dv.getUint16(e.local + 26, true);
  const lExtraLen = dv.getUint16(e.local + 28, true);
  const start = e.local + 30 + lNameLen + lExtraLen;
  const comp = u8.subarray(start, start + e.compSize);
  const raw = e.method === 0 ? comp : await zipInflateRaw(comp);
  return new TextDecoder().decode(raw);
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

const DOC_CAP = 80_000; // batas karakter teks yang dikirim ke model

export async function extractDocText(file: File): Promise<string | null> {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!DOC_EXTS.includes(ext)) return null;
  try {
    const ab = await file.arrayBuffer();
    const u8 = new Uint8Array(ab);
    const dv = new DataView(ab);
    const entries = zipEntries(u8, dv);
    if (entries.length === 0) return null;

    let text = "";
    if (ext === "docx") {
      const xmlEntry = entries.find((e) => e.name === "word/document.xml");
      if (!xmlEntry) return null;
      const xml = await zipReadEntry(u8, dv, xmlEntry);
      text = xml
        .replace(/<w:tab[^>]*\/>/g, "\t")
        .replace(/<w:br[^>]*\/>/g, "\n")
        .replace(/<\/w:p>/g, "\n")
        .replace(/<[^>]+>/g, "");
      text = unescapeXml(text);
    } else {
      // xlsx: sharedStrings + tiap sheet -> satu baris per <row>, sel dipisah " | "
      const shared: string[] = [];
      const ssEntry = entries.find((e) => e.name === "xl/sharedStrings.xml");
      if (ssEntry) {
        const ss = await zipReadEntry(u8, dv, ssEntry);
        for (const si of ss.match(/<si>[\s\S]*?<\/si>/g) || []) {
          const parts = (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).map((x) =>
            unescapeXml(x.replace(/<[^>]+>/g, "")),
          );
          shared.push(parts.join(""));
        }
      }
      const sheets = entries.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      const lines: string[] = [];
      for (const sh of sheets) {
        const xml = await zipReadEntry(u8, dv, sh);
        for (const row of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
          const cells: string[] = [];
          for (const c of row.match(/<c[\s\S]*?(?:<\/c>|\/>)/g) || []) {
            let v = "";
            if (/t="s"/.test(c)) {
              const m = c.match(/<v>(\d+)<\/v>/);
              v = m ? shared[Number(m[1])] || "" : "";
            } else {
              const m = c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || c.match(/<v>([\s\S]*?)<\/v>/);
              v = m ? unescapeXml(m[1]) : "";
            }
            if (v) cells.push(v);
          }
          if (cells.length) lines.push(cells.join(" | "));
        }
      }
      text = lines.join("\n");
    }
    text = text.replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return null;
    return text.length > DOC_CAP ? text.slice(0, DOC_CAP) + "\n…[dokumen dipotong]" : text;
  } catch {
    return null;
  }
}

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

export function classifyFile(name: string, mime: string): FileClass {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  if (
    ["application/json", "application/xml", "application/yaml", "application/javascript"].includes(mime)
  ) {
    return "text";
  }
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
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

// language: TypeScript, file: lib/request-guard.ts, target: gerbang same-origin untuk API yang menulis data
// API hanya boleh dipanggil dari halaman ai.onheil.fun sendiri (pola GPT/Claude): wajib
// browser yang benar-benar berada di situs ini. Tanpa header = skrip/curl ditolak 403.

export type OriginVerdict = { ok: boolean; reason?: string };

/**
 * Aturan:
 *  - Ada `Origin`     -> harus sama host-nya dengan request (scheme bebas).
 *  - `Origin: null`   -> sandbox/iframe/konteks opaque -> tolak.
 *  - Tanpa `Origin`   -> wajib `Sec-Fetch-Site: same-origin` (browser modern selalu
 *                        mengirim ini untuk fetch POST/PATCH). `same-site` ditolak karena
 *                        mencakup subdomain asing; `none` = navigasi langsung, bukan fetch API.
 *  - Keduanya kosong   -> curl/script murni -> tolak.
 *
 * CATATAN jujur: header bisa dipalsukan penyerang yang tahu cara (Origin/Sec-Fetch dikirim
 * sesuai niatan mereka). Gerbang ini menutup pemakaian sembarangan (bot, curl kasar,
 * eksekusi dari domain lain) — penyerang yang memalsukan header tinggal kena rate-limit
 * per-user di /api/chat.
 */
export function checkSameOrigin(headers: {
  get(name: string): string | null;
}): OriginVerdict {
  const origin = headers.get("origin");
  const site = headers.get("sec-fetch-site");
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").toLowerCase();

  if (!host) return { ok: false, reason: "no_host" };

  if (origin !== null) {
    if (origin === "null") return { ok: false, reason: "opaque_origin" };
    let oh: string;
    try {
      oh = new URL(origin).host.toLowerCase();
    } catch {
      return { ok: false, reason: "bad_origin" };
    }
    if (oh !== host) return { ok: false, reason: "cross_origin" };
    return { ok: true };
  }

  if (site !== null) {
    return site === "same-origin"
      ? { ok: true }
      : { ok: false, reason: `sec_fetch_site:${site}` };
  }

  return { ok: false, reason: "no_origin_headers" };
}

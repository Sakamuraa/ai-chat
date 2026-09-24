// language: TypeScript, file: lib/tools/web.ts, target: web_search + web_extract dengan penjaga SSRF
import type { ToolDef, ToolResult } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ALLOWED_PROTO = new Set(["http:", "https:"]);
/** host privat/metadata yang tak boleh dijarah dari sisi server */
function blockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("[fd") || h === "[::1]") return true;
  if (h === "169.254.169.254") return true;
  return false;
}

async function safeFetch(url: string, timeoutMs = 15_000): Promise<Response> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("URL tidak valid");
  }
  if (!ALLOWED_PROTO.has(u.protocol)) throw new Error("Protokol hanya boleh http/https");
  if (blockedHost(u.hostname)) throw new Error("Alamat itu diblokir (privat/metadata)");
  const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8" } });
  if (res.url) {
    const ru = new URL(res.url);
    if (blockedHost(ru.hostname)) throw new Error("Alamat itu diblokir (privat/metadata)");
  }
  return res;
}

/** Potong HTML jadi teks — cukup untuk bahan jawaban model. */
function htmlToText(html: string, limit: number): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  const spaced = noScript.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article|blockquote)>/gi, "\n").replace(/<[^>]+>/g, " ");
  const decode = (s: string) =>
    s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
     .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  const text = decode(spaced).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text.slice(0, limit);
}

const search: ToolDef = {
  name: "web_search",
  description:
    "Cari di internet. Mengembalikan daftar judul, URL, dan cuplikan. Pakai untuk fakta terkini, berita, dokumentasi, atau hal yang tidak kamu tahu.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Kata kunci pencarian" },
      n: { type: "integer", minimum: 1, maximum: 8, description: "Jumlah hasil (default 5)" },
    },
    required: ["query"],
  },
  enabled: () => true,
  execute: async (args): Promise<ToolResult> => {
    const q = String(args.query ?? "").trim();
    if (!q) return { ok: false, error: "query kosong" };
    const n = Math.min(8, Math.max(1, Number(args.n) || 5));
    try {
      const res = await safeFetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`);
      const html = await res.text();
      const items: { title: string; url: string; snippet: string }[] = [];
      const re = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
      const strip = (s: string) => htmlToText(s, 300);
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && items.length < n) {
        let href = m[1];
        if (href.startsWith("//duckduckgo.com/l/?uddg=")) {
          try {
            href = decodeURIComponent(new URL("https:" + href).searchParams.get("uddg") ?? href);
          } catch {
            /* biarkan */
          }
        }
        if (!href.startsWith("http")) continue;
        items.push({ title: strip(m[2]).trim(), url: href, snippet: m[3] ? strip(m[3]).trim() : "" });
      }
      if (items.length === 0) return { ok: false, error: `tidak ada hasil untuk "${q}"` };
      const text = items
        .map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}${it.snippet ? `\n   ${it.snippet}` : ""}`)
        .join("\n");
      return { ok: true, text: `Hasil pencarian untuk "${q}":\n\n${text}` };
    } catch (e) {
      return { ok: false, error: `pencarian gagal: ${(e as Error).message}` };
    }
  },
};

const extract: ToolDef = {
  name: "web_extract",
  description:
    "Ambil isi halaman web sebagai teks (maksimal ~12.000 karakter). Pakai setelah web_search untuk membaca isi URL tertentu.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "URL lengkap, diawali http/https" } },
    required: ["url"],
  },
  enabled: () => true,
  execute: async (args): Promise<ToolResult> => {
    const url = String(args.url ?? "").trim();
    try {
      const res = await safeFetch(url);
      const ctype = res.headers.get("content-type") ?? "";
      if (ctype && !/text\/html|text\/plain|application\/json|application\/xml|text\/xml/.test(ctype)) {
        return { ok: false, error: `jenis konten tidak didukung: ${ctype.split(";")[0]}` };
      }
      const raw = await res.text();
      const body = ctype.includes("html") ? htmlToText(raw, 12_000) : raw.slice(0, 12_000);
      if (!body.trim()) return { ok: false, error: "halaman kosong" };
      return { ok: true, text: `Isi ${url} (sudah disederhanakan):\n\n${body}` };
    } catch (e) {
      return { ok: false, error: `gagal membaca: ${(e as Error).message}` };
    }
  },
};

export const WEB_TOOLS: ToolDef[] = [search, extract];

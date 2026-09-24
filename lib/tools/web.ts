// language: TypeScript, file: lib/tools/web.ts, target: web_search (rantai mesin: Bing -> DuckDuckGo -> Wikipedia) + web_extract, penjaga SSRF
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
  const res = await fetch(u, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" } });
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

const strip300 = (s: string) => htmlToText(s, 300).trim();

type Item = { title: string; url: string; snippet: string };

/** Bing membungkus hasil di /ck/a?...&u=a1<base64url> — decode balik ke URL asli. */
function decodeBingHref(href: string): string {
  try {
    const u = new URL(href, "https://www.bing.com");
    const raw = u.searchParams.get("u");
    if (raw && raw.startsWith("a1")) {
      const body = raw.slice(2);
      const b64 = body + "=".repeat((4 - (body.length % 4)) % 4);
      const out = Buffer.from(b64, "base64url").toString("utf8");
      if (out.startsWith("http")) return out;
    }
  } catch {
    /* biarkan href asli */
  }
  return href;
}

/** Mesin 1: Bing — paling stabil dari IP server (tanpa captcha). */
async function searchBing(q: string, n: number): Promise<Item[]> {
  const html = await (
    await safeFetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=10&setlang=en&cc=US`)
  ).text();
  const out: Item[] = [];
  const push = (href: string, title: string, snippet: string) => {
    const url = decodeBingHref(href);
    if (!url.startsWith("http")) return;
    if (/bing\.com|microsoft\.com|msn\.com|live\.com/.test(url)) return;
    if (out.some((x) => x.url === url)) return;
    out.push({ title: strip300(title), url, snippet: strip300(snippet) });
  };

  // pola utama: <h2><a href>judul</a> ... <p class="b_lineclamp...">cuplikan</p>
  const reMain = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1500}?<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = reMain.exec(html)) && out.length < n * 3) push(m[1], m[2], m[3] ?? "");
  // cadangan: judul saja tanpa cuplikan
  if (out.length === 0) {
    const reTitle = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/g;
    while ((m = reTitle.exec(html)) && out.length < n * 3) push(m[1], m[2], "");
  }
  return out;
}

/** Mesin 2/3: DuckDuckGo html + lite — dilewati kalau kena halaman anomali. */
async function searchDdg(q: string, n: number): Promise<Item[]> {
  const clean = (href: string): string => {
    let h = href;
    for (const prefix of ["//duckduckgo.com/l/?uddg=", "https://duckduckgo.com/l/?uddg="]) {
      if (h.startsWith(prefix)) {
        try {
          h = decodeURIComponent(new URL(h.startsWith("//") ? "https:" + h : h).searchParams.get("uddg") ?? h);
        } catch {
          /* biarkan */
        }
      }
    }
    return h;
  };
  for (const endpoint of [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
  ]) {
    let html = "";
    try {
      html = await (await safeFetch(endpoint)).text();
    } catch {
      continue;
    }
    // halaman tantangan (anomaly/captcha) = bukan hasil, langsung mesin berikutnya
    if (/anomaly|captcha|challenge/i.test(html)) continue;

    const out: Item[] = [];
    const re1 = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,600}?class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m: RegExpExecArray | null;
    while ((m = re1.exec(html)) && out.length < n * 3) {
      const url = clean(m[1]);
      if (!url.startsWith("http")) continue;
      out.push({ title: strip300(m[2]), url, snippet: m[4] ? strip300(m[4]) : "" });
    }
    if (out.length === 0) {
      const re2 = /<a[^>]*rel="nofollow"[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      while ((m = re2.exec(html)) && out.length < n * 3) {
        const url = clean(m[1]);
        if (url.includes("duckduckgo.com")) continue;
        out.push({ title: strip300(m[2]), url, snippet: "" });
      }
    }
    if (out.length > 0) return out;
  }
  return [];
}

/** Mesin 4: Wikipedia — selalu jalan, penutup rantai untuk pertanyaan entitas. */
async function searchWikipedia(q: string, n: number): Promise<Item[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${n}`;
  const res = await safeFetch(url);
  const data = (await res.json()) as { query?: { search?: { title: string; snippet: string }[] } };
  return (data.query?.search ?? []).map((s) => ({
    title: s.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`,
    snippet: strip300(s.snippet),
  }));
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
    // rantai: Bing (stabil) -> DuckDuckGo (html, lalu lite) -> Wikipedia
    const engines: { name: string; run: () => Promise<Item[]> }[] = [
      { name: "bing", run: () => searchBing(q, n) },
      { name: "ddg", run: () => searchDdg(q, n) },
      { name: "wikipedia", run: () => searchWikipedia(q, n) },
    ];
    const errors: string[] = [];
    for (const eng of engines) {
      try {
        const items = await eng.run();
        if (items.length > 0) {
          const text = items
            .slice(0, n)
            .map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}${it.snippet ? `\n   ${it.snippet}` : ""}`)
            .join("\n");
          return { ok: true, text: `Hasil pencarian untuk "${q}" (via ${eng.name}):\n\n${text}` };
        }
        errors.push(`${eng.name}: kosong`);
      } catch (e) {
        errors.push(`${eng.name}: ${(e as Error).message}`);
      }
    }
    return { ok: false, error: `tidak ada hasil untuk "${q}" (${errors.join("; ")})` };
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

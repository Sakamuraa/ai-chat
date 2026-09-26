import type { ToolDef, ToolResult } from "./types";

// --- SSRF guard: blokir host privat/metadata ---
const ALLOWED_PROTO = new Set(["http:", "https:"]);
function blockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("[fd") || h === "[::1]") return true;
  return false;
}

async function safeFetch(url: string, timeoutMs = 15_000, accept?: string): Promise<Response> {
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("URL tidak valid"); }
  if (!ALLOWED_PROTO.has(u.protocol)) throw new Error("Protokol hanya boleh http/https");
  if (blockedHost(u.hostname)) throw new Error("Alamat itu diblokir (privat/metadata)");
  const res = await fetch(u, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      accept: accept ?? "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (res.url) {
    const ru = new URL(res.url);
    if (blockedHost(ru.hostname)) throw new Error("Alamat itu diblokir (privat/metadata)");
  }
  return res;
}

// --- web_search ---
type Item = { title: string; url: string; snippet: string };

function strip300(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

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
  } catch { /* fallback */ }
  return href;
}

async function searchBing(q: string, n: number): Promise<Item[]> {
  const html = await (await safeFetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&count=10&setlang=en&cc=US`)).text();
  const out: Item[] = [];
  const push = (href: string, title: string, snippet: string) => {
    const url = decodeBingHref(href);
    if (!url.startsWith("http")) return;
    if (/bing\.com|microsoft\.com|msn\.com|live\.com/.test(url)) return;
    if (out.some((x) => x.url === url)) return;
    out.push({ title: strip300(title), url, snippet: strip300(snippet) });
  };
  const re = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1500}?<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < n * 3) push(m[1], m[2], m[3] ?? "");
  if (out.length === 0) {
    const re2 = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/g;
    while ((m = re2.exec(html)) && out.length < n * 3) push(m[1], m[2], "");
  }
  return out;
}

async function searchBingRss(q: string, n: number): Promise<Item[]> {
  const res = await safeFetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`, 12_000, "application/rss+xml,application/xml,text/xml,*/*");
  if (!res.ok) throw new Error(`bing-rss ${res.status}`);
  const xml = await res.text();
  const items: Item[] = [];
  for (const b of xml.split("<item>").slice(1)) {
    const title = (b.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").trim();
    const link = (b.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
    const desc = (b.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "").trim();
    if (!title || !link.startsWith("http")) continue;
    const host = (() => { try { return new URL(link).hostname; } catch { return ""; } })();
    if (/bing\.com|microsoft\.com|go\.microsoft/i.test(host)) continue;
    items.push({ title: strip300(title), url: link, snippet: strip300(desc) });
    if (items.length >= n) break;
  }
  if (!items.length) throw new Error("bing-rss: kosong");
  return items;
}

async function searchDdg(q: string, n: number): Promise<Item[]> {
  const clean = (h: string) => {
    for (const p of ["//duckduckgo.com/l/?uddg=", "https://duckduckgo.com/l/?uddg="]) {
      if (h.startsWith(p)) { try { h = decodeURIComponent(new URL(h.startsWith("//") ? "https:" + h : h).searchParams.get("uddg") ?? h); } catch {} }
    }
    return h;
  };
  for (const ep of [`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`]) {
    let html = "";
    try { html = await (await safeFetch(ep)).text(); } catch { continue; }
    if (/anomaly|captcha|challenge/i.test(html)) continue;
    const out: Item[] = [];
    const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]{0,600}?class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && out.length < n * 3) {
      const url = clean(m[1]);
      if (!url.startsWith("http")) continue;
      out.push({ title: strip300(m[2]), url, snippet: m[4] ? strip300(m[4]) : "" });
    }
    if (out.length > 0) return out;
  }
  return [];
}

async function searchWikipedia(q: string, n: number): Promise<Item[]> {
  const res = await safeFetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=${n}`);
  const data = await res.json() as { query?: { search?: { title: string; snippet: string }[] } };
  return (data.query?.search ?? []).map(s => ({
    title: s.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`,
    snippet: strip300(s.snippet),
  }));
}

// --- util: HTML -> teks ---
function htmlToText(html: string, limit: number): string {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ");
  const spaced = noScript.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article|blockquote)>/gi, "\n").replace(/<[^>]+>/g, " ");
  const decode = (s: string) => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  return decode(spaced).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

// --- tool definitions ---

const search: ToolDef = {
  name: "web_search",
  description: "Cari di internet. Mengembalikan daftar judul, URL, dan cuplikan. Pakai untuk fakta terkini, berita, dokumentasi, atau hal yang tidak kamu tahu.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Kata kunci pencarian" },
      n: { type: "integer", minimum: 1, maximum: 4, description: "Jumlah hasil per pencarian (maksimal 4)" },
    },
    required: ["query"],
  },
  enabled: () => true,
  execute: async (args): Promise<ToolResult> => {
    const q = String(args.query ?? "").trim();
    if (!q) return { ok: false, error: "query kosong" };
    const n = Math.min(4, Math.max(1, Number(args.n) || 4));
    const engines: { name: string; run: () => Promise<Item[]> }[] = [
      { name: "bing", run: () => searchBing(q, n) },
      { name: "bing-rss", run: () => searchBingRss(q, n) },
      { name: "ddg", run: () => searchDdg(q, n) },
      { name: "wikipedia", run: () => searchWikipedia(q, n) },
    ];
    const errors: string[] = [];
    for (const eng of engines) {
      try {
        const items = await eng.run();
        if (items.length > 0) {
          const text = items.slice(0, n).map((it, i) => `${i + 1}. ${it.title}\n   ${it.url}${it.snippet ? `\n   ${it.snippet}` : ""}`).join("\n");
          return { ok: true, text: `HASIL WEB TERKINI untuk "${q}" (via ${eng.name}):\n\n${text}` };
        }
        errors.push(`${eng.name}: kosong`);
      } catch (e) { errors.push(`${eng.name}: ${(e as Error).message}`); }
    }
    return { ok: false, error: `tidak ada hasil untuk "${q}" (${errors.join("; ")})` };
  },
};

const extract: ToolDef = {
  name: "web_extract",
  description: "Ambil isi halaman web sebagai teks bersih (maksimal ~12.000 karakter). HTML dihilangkan. Pakai untuk baca artikel, blog, dokumentasi.",
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
    } catch (e) { return { ok: false, error: `gagal membaca: ${(e as Error).message}` }; }
  },
};

const fetch_: ToolDef = {
  name: "web_fetch",
  description: "Ambil isi mentah dari URL: JSON API, raw file, RSS, kode sumber, atau respons API apa pun (maksimal ~16.000 karakter). TIDAK menghapus tag HTML — konten dikembalikan apa adanya. Pakai untuk GitHub API, endpoint API, raw.githubusercontent.com, atau saat web_extract tidak cukup.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL lengkap, diawali http/https" },
      accept: { type: "string", description: "Accept header opsional, misal application/json atau application/vnd.github+json" },
    },
    required: ["url"],
  },
  enabled: () => true,
  execute: async (args): Promise<ToolResult> => {
    const url = String(args.url ?? "").trim();
    const accept = String(args.accept ?? "").trim() || undefined;
    try {
      const res = await safeFetch(url, 20_000, accept);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: `HTTP ${res.status}${body ? `: ${body.slice(0, 400)}` : ""}` };
      }
      const ctype = res.headers.get("content-type") ?? "";
      const raw = await res.text();
      if (!raw.trim()) return { ok: false, error: "respons kosong" };
      const body = raw.slice(0, 16_000);
      const label = ctype.split(";")[0].trim() || "unknown";
      return { ok: true, text: `Konten mentah dari ${url}\n(Content-Type: ${label}, ${raw.length} byte):\n\n${body}` };
    } catch (e) { return { ok: false, error: `gagal fetch: ${(e as Error).message}` }; }
  },
};

export const WEB_TOOLS: ToolDef[] = [search, extract, fetch_];

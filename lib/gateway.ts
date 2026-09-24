// language: TypeScript, file: lib/gateway.ts, target: Vercel route handler (server-side only)
// *key tidak pernah NEXT_PUBLIC_ — hanya dibaca di server*

const BASE = () => process.env.GATEWAY_BASE ?? "https://router.onheil.fun/v1";

function key(): string {
  const k = process.env.GATEWAY_KEY;
  if (!k) throw new Error("GATEWAY_KEY missing");
  return k;
}

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ToolCallRef = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatPart[] | null;
  /** hanya pada pesan assistant yang memanggil tool */
  tool_calls?: ToolCallRef[];
  /** hanya pada balasan tool */
  tool_call_id?: string;
};

/** Streaming SSE mentah dari gateway — diteruskan ke client apa adanya. */
export async function streamChat(
  model: string,
  messages: ChatMsg[],
  signal?: AbortSignal,
  /** daftar tool OpenAI-compatible; kosong = tanpa tool */
  tools?: unknown[],
) {
  const res = await fetch(`${BASE()}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
    }),
    signal: signal ?? AbortSignal.timeout(300_000),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`gateway ${res.status}: ${body.slice(0, 400)}`), { status: res.status });
  }
  return res;
}

/** Panggilan non-stream (judul sesi). Fail-open: lempar error, caller mengabaikan. */
/**
 * Panggilan non-stream. max_tokens HARUS besar (default 400): model di gateway ini
 * adalah model penalaran — reasoning_tokens menghabiskan kuota, sehingga max_tokens
 * kecil (40-80) menghasilkan content kosong dengan finish_reason=length.
 */
export async function completeChat(
  model: string,
  messages: ChatMsg[],
  maxTokens = 400,
): Promise<string> {
  const res = await fetch(`${BASE()}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: false }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

export const FALLBACK_MODELS = ["onheil-1.1-luna", "onheil-1.5-selenia"].map((id) => ({
  id,
  label: id,
}));

const TITLE_CANDIDATES = () => {
  // Bukti terukur 2026-09-24: model studio (onheil-1.1-luna / selenia) kadang balas
  // string kosong (finish_reason=length) untuk panggilan non-stream pendek; combo 'free'
  // selalu terisi. Urutan: combo dulu sebagai jaring pengaman, studio sebagai preferensi.
  const primary = process.env.TITLE_MODEL ?? "free";
  return [...new Set([primary, "free", "onheil-1.1-luna", "onheil-1.5-selenia"])];
};


/**
 * Model penalaran suka membungkus jawaban dengan markdown/petik/atribut.
 * Buang semua simbol, pakai Title Case, maksimal 5 kata / 60 karakter.
 */
export function sanitizeTitle(raw: string): string {
  const stripped = raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>~\[\](){}|/\\]/g, " ")
    .replace(/["'\u201c\u201d\u2018\u2019]/g, "")
    .replace(/[=:;,\.!?\u2026\-\u2013\u2014]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = stripped.split(" ").filter(Boolean);
  if (words.length === 0) return "";
  return words
    .slice(0, 5)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .slice(0, 60);
}

/** Normalisasi untuk mendeteksi judul yang cuma menyalin prompt. */
function normForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** true kalau judul hanya salinan/potongan kasar dari teks user. */
export function titleLooksLikeCopy(title: string, source: string): boolean {
  const nt = normForCompare(title);
  const ns = normForCompare(source.replace(/^Pertanyaan user:\s*/i, ""));
  if (!nt || !ns) return false;
  if (nt === ns) return true;
  // judul = awal/akhir prompt yang dipotong kasar (atau prompt muat di judul)
  if (nt.length >= 4 && (ns.startsWith(nt) || nt.startsWith(ns))) return true;
  // judul = potongan verbatim >= 3 kata berturut-turut dari prompt -> tetap salinan
  const tw = nt.split(" ");
  const sw = ns.split(" ");
  if (tw.length >= 3 && sw.length >= tw.length) {
    for (let i = 0; i + tw.length <= sw.length; i++) {
      if (sw.slice(i, i + tw.length).join(" ") === nt) return true;
    }
  }
  return false;
}

const TITLE_RULES =
  "You name chat sessions. Reply with 3 to 5 words, Title Case, plain words only. " +
  "NO markdown, NO quotes, NO symbols, NO punctuation, NO explanation. Words separated by single spaces. " +
  "NEVER copy, repeat, translate or lightly trim the user's own words - write a fresh TOPIC label instead. " +
  "Examples: user says 'halo kamu siapa' -> 'Pembukaan Percakapan'; " +
  "user says 'buatkan template paper progress web app' -> 'Template Paper Webapp'; " +
  "user says 'kenapa file docx tidak bisa dibuka' -> 'Dokumen Docx Gagal'.";

/**
 * Judul = ringkasan/topik pembahasan (permintaan Manuel), maksimal 5 kata.
 * Input berisi pertanyaan user (dipanggil bersamaan dengan stream, jadi jawaban belum ada).
 * Dua putaran: percobaan normal, kalau hasilnya cuma salinan prompt -> putaran kedua
 * dengan larangan menyalin yang lebih tegas; tetap menyalin -> "" (caller biarkan 'New chat').
 * Fail-open: string kosong -> caller membiarkan 'New chat'.
 */
export async function generateTitle(exchange: string): Promise<string> {
  const user: ChatMsg = { role: "user", content: exchange.slice(0, 700) };
  const passes: ChatMsg[] = [
    { role: "system", content: TITLE_RULES },
    {
      role: "system",
      content:
        TITLE_RULES +
        " CRITICAL: your answer must not be a substring of the user's message. " +
        "If you catch yourself echoing the user, replace it with the underlying topic.",
    },
  ];

  const candidates = TITLE_CANDIDATES();
  for (let pass = 0; pass < passes.length; pass++) {
    for (const model of candidates) {
      try {
        const out = await completeChat(model, [passes[pass], user]);
        const title = sanitizeTitle(out);
        if (!title) continue;
        if (titleLooksLikeCopy(title, exchange)) continue; // salinan -> coba lagi
        return title;
      } catch {
        /* kandidat berikutnya */
      }
    }
  }
  return "";
}

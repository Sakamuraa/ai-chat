// language: TypeScript, file: lib/gateway.ts, target: Vercel route handler (server-side only)
// *key tidak pernah NEXT_PUBLIC_ — hanya dibaca di server*

const BASE = () => process.env.GATEWAY_BASE ?? "https://router.onheil.fun/v1";

function key(): string {
  const k = process.env.GATEWAY_KEY;
  if (!k) throw new Error("GATEWAY_KEY missing");
  return k;
}

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

/** Streaming SSE mentah dari gateway — diteruskan ke client apa adanya. */
export async function streamChat(model: string, messages: ChatMsg[], signal?: AbortSignal) {
  const res = await fetch(`${BASE()}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
    body: JSON.stringify({ model, messages, stream: true }),
    signal: signal ?? AbortSignal.timeout(300_000),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`gateway ${res.status}: ${body.slice(0, 400)}`), { status: res.status });
  }
  return res;
}

/** Panggilan non-stream (judul sesi, ringkasan). Fail-open: lempar error, biar caller mengabaikan. */
export async function completeChat(model: string, messages: ChatMsg[]): Promise<string> {
  const res = await fetch(`${BASE()}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
    body: JSON.stringify({ model, messages, max_tokens: 60, stream: false }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Daftar model untuk picker. Throw kalau gateway mati — caller pakai fallback statis. */
export async function listModels(): Promise<{ id: string; label: string }[]> {
  const res = await fetch(`${BASE()}/models`, {
    headers: { authorization: `Bearer ${key()}` },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`models ${res.status}`);
  const data = (await res.json()) as { data?: { id?: string; name?: string }[] };
  return (data.data ?? [])
    .filter((m): m is { id: string; name?: string } => typeof m.id === "string" && m.id.length > 0)
    .map((m) => ({ id: m.id, label: m.name ?? m.id }));
}

export const FALLBACK_MODELS = [
  "onheil-1.1-luna",
  "onheil-1.5-selenia",
  "free",
  "claude-opus",
  "kiro",
  "codebunny",
  "bynara",
  "tokenharbor",
  "xkiro",
  "dipsek",
  "routeway",
  "justworker",
].map((id) => ({ id, label: id }));

const TITLE_MODEL = () => process.env.TITLE_MODEL ?? "onheil-1.1-luna";

const TITLE_CANDIDATES = () => {
  const primary = process.env.TITLE_MODEL ?? "onheil-1.1-luna";
  // fallback: upstream studio kadang balas kosong (finish_reason=length) — pakai combo yang terbukti hidup
  return primary === "free" ? ["free"] : [primary, "free"];
};

/** Judul sesi otomatis dari pesan pertama. Fail-open: string kosong = caller biarkan 'New chat'. */
export async function generateTitle(firstUserMessage: string): Promise<string> {
  const sys = {
    role: "system" as const,
    content:
      "You write chat titles. Reply with exactly 3 to 5 words in Title Case. No punctuation, no quotes, no explanation. Title only.",
  };
  const user = { role: "user" as const, content: firstUserMessage.slice(0, 400) };

  for (const model of TITLE_CANDIDATES()) {
    try {
      const out = await completeChat(model, [sys, user]);
      const clean = out
        .trim()
        .replace(/^["'\s]+|["'\s]+$/g, "")
        .replace(/[.,;:!?]+$/g, "");
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length > 0) return words.slice(0, 6).join(" ").slice(0, 60); // batas: 6 kata / 60 char
    } catch {
      /* kandidat berikutnya */
    }
  }
  return "";
}

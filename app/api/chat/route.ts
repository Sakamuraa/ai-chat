// language: TypeScript, file: app/api/chat/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { streamChat, generateTitle, type ChatMsg, type ChatPart } from "@/lib/gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

const Attachment = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["image", "text"]),
  mime: z.string().max(80),
  data: z.string().max(4_000_000), // data URL (image) atau teks isi file
});

const Body = z.object({
  sessionId: z.string().uuid(),
  model: z.string().min(1).max(120),
  content: z.string().min(1).max(32_000),
  regenerate: z.boolean().optional(),
  attachments: z.array(Attachment).max(6).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Teks file disematkan inline supaya replay riwayat tetap utuh tanpa menyimpan biner. */
function withTextAttachments(text: string, files: z.infer<typeof Attachment>[]): string {
  const docs = files.filter((f) => f.kind === "text");
  if (docs.length === 0) return text;
  const blocks = docs
    .map((f) => `Lampiran "${f.name}" (${f.mime}):\n\`\`\`\n${f.data.slice(0, 12_000)}\n\`\`\``)
    .join("\n\n");
  return `${text}\n\n---\n\n${blocks}`;
}

/** Konteks sistem: kepribadian + memori (opsional, dari profil user). */
async function systemMessages(userId: string): Promise<ChatMsg[]> {
  const rows = (await db()`
    SELECT username, personality, memory_enabled FROM users WHERE id = ${userId}
  `) as unknown as { username: string; personality: string | null; memory_enabled: boolean }[];
  const u = rows[0];
  if (!u) return [];

  const msgs: ChatMsg[] = [
    {
      role: "system",
      content:
        (u.personality?.trim()
          ? `Gaya jawaban yang diminta user: ${u.personality.trim()}\n\n`
          : "") +
        `Kamu sedang melayani username "${u.username}" di OnheilAI. Jawab dalam bahasa percakapan user.`,
    },
  ];

  if (u.memory_enabled) {
    const prior = (await db()`
      SELECT title FROM sessions
      WHERE user_id = ${userId} AND title <> 'New chat'
      ORDER BY updated_at DESC LIMIT 5
    `) as unknown as { title: string }[];
    if (prior.length > 0) {
      msgs.push({
        role: "system",
        content: `Riwayat topik user ini (judul sesi terakhir): ${prior.map((p) => p.title).join(" · ")}.`,
      });
    }
  }
  return msgs;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.issues[0]?.message ?? "Data tidak valid" },
      { status: 400 },
    );
  }
  const { sessionId, model, content, regenerate, attachments } = parsed.data;

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  // 1. sesi harus milik user — selain itu 404
  const sessions = (await db()`
    SELECT id, title FROM sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `) as unknown as { id: string; title: string }[];
  if (!sessions[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const userText = withTextAttachments(content, attachments ?? []);
  const images = (attachments ?? []).filter((a) => a.kind === "image");

  // 2. simpan pesan user (regenerate: ganti jawaban terakhir, jangan duplikat prompt)
  if (regenerate) {
    await db()`
      DELETE FROM messages
      WHERE session_id = ${sessionId} AND role = 'assistant'
        AND id = (SELECT max(id) FROM messages WHERE session_id = ${sessionId} AND role = 'assistant')
    `;
  } else {
    const note = images.length > 0 ? `[foto: ${images.map((i) => i.name).join(", ")}] ` : "";
    await db()`
      INSERT INTO messages (session_id, role, content) VALUES (${sessionId}, 'user', ${note + userText})
    `;
    await db()`UPDATE sessions SET updated_at = now() WHERE id = ${sessionId}`;
  }

  // 3. riwayat + konteks sistem
  const history = (await db()`
    SELECT role, content FROM messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC, id ASC
    LIMIT 200
  `) as unknown as { role: ChatMsg["role"]; content: string }[];

  const turns: ChatMsg[] = history.map((m) => ({ role: m.role, content: m.content }));

  // gambar hanya untuk giliran ini (tidak disimpan ke DB supaya tidak membengkak)
  if (images.length > 0) {
    const parts: ChatPart[] = [
      { type: "text", text: content },
      ...images.map((i) => ({ type: "image_url" as const, image_url: { url: i.data } })),
    ];
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === "user") {
        turns[i] = { role: "user", content: parts };
        break;
      }
    }
  }

  const messages: ChatMsg[] = [...(await systemMessages(user.id)), ...turns];

  // 4. judul sesi: dijalankan BERSAMAAN dengan stream (model penalaran butuh ~10 dtk),
  //    jadi saat stream selesai judul sudah siap -> sidebar tidak pernah menampilkan 'New chat'.
  const needsTitle = sessions[0].title === "New chat" && !regenerate;
  const titlePromise: Promise<string> = needsTitle
    ? generateTitle(
        `Pertanyaan user:\n${String(userText).slice(0, 500)}`,
      ).catch(() => "")
    : Promise.resolve("");

  // 5. streaming dari gateway
  let gateway: Response;
  try {
    gateway = await streamChat(model, messages, abort.signal);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return NextResponse.json(
      { error: "gateway_error", detail: String(e).slice(0, 300) },
      { status: status >= 400 && status < 600 ? status : 502 },
    );
  }

  const reader = gateway.body!.getReader();
  const chunks: Uint8Array[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          const full = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
          const assistantText = extractSseText(full);
          try {
            if (assistantText) {
              await db()`
                INSERT INTO messages (session_id, role, content) VALUES (${sessionId}, 'assistant', ${assistantText})
              `;
              await db()`UPDATE sessions SET updated_at = now() WHERE id = ${sessionId}`;
            }
            if (needsTitle) {
              // beri jeda maksimal 5 dtk untuk judul yang hampir siap; kalau belum, biarkan
              const title = await Promise.race([titlePromise, sleep(5000).then(() => "")]);
              if (title) {
                await db()`UPDATE sessions SET title = ${title} WHERE id = ${sessionId} AND title = 'New chat'`;
              }
            }
          } catch (e) {
            console.error("post-stream persist failed", e);
          }
          ctrl.close();
          return;
        }
        if (value) {
          chunks.push(value);
          ctrl.enqueue(value);
        }
      } catch (e) {
        console.error("stream pull failed", e);
        ctrl.error(e);
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

/** Ambil `delta.content` dari semua event SSE OpenAI-compatible. */
export function extractSseText(raw: string): string {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("data:")) continue;
    const payload = s.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const obj = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
      const piece = obj.choices?.[0]?.delta?.content;
      if (typeof piece === "string") out.push(piece);
    } catch {
      /* potongan tidak valid — lewati */
    }
  }
  return out.join("");
}

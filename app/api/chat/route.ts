// language: TypeScript, file: app/api/chat/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { streamChat, generateTitle, type ChatMsg } from "@/lib/gateway";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  sessionId: z.string().uuid(),
  model: z.string().min(1).max(120),
  content: z.string().min(1).max(32_000),
  regenerate: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const { sessionId, model, content, regenerate } = parsed.data;

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  // 1. sesi harus milik user — selain itu 404
  const sessions = (await db()`
    SELECT id, title FROM sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `) as unknown as { id: string; title: string }[];
  if (!sessions[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 2. simpan pesan user (regenerate: pesan user terakhir sudah ada — jangan diduplikasi,
  //    jawaban assistant terakhir yang akan diganti)
  if (regenerate) {
    await db()`
      DELETE FROM messages
      WHERE session_id = ${sessionId} AND role = 'assistant'
        AND id = (SELECT max(id) FROM messages WHERE session_id = ${sessionId} AND role = 'assistant')
    `;
  } else {
    await db()`
      INSERT INTO messages (session_id, role, content) VALUES (${sessionId}, 'user', ${content})
    `;
    await db()`UPDATE sessions SET updated_at = now() WHERE id = ${sessionId}`;
  }

  // 3. riwayat
  const history = (await db()`
    SELECT role, content FROM messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC, id ASC
    LIMIT 200
  `) as unknown as ChatMsg[];

  // 4. streaming dari gateway
  let gateway: Response;
  try {
    gateway = await streamChat(model, history, abort.signal);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return NextResponse.json(
      { error: "gateway_error", detail: String(e).slice(0, 300) },
      { status: status >= 400 && status < 600 ? status : 502 },
    );
  }

  const reader = gateway.body!.getReader();
  const chunks: Uint8Array[] = [];
  // judul auto hanya untuk chat pertama (regenerate tidak boleh mengulanginya)
  const isFirstUserMessage = history.filter((m) => m.role === "user").length === 1 && !regenerate;

  // after() HARUS dipanggil di scope request (bukan di dalam pull -> di luar scope = throw).
  // Callback menunggu stream selesai lewat deferred, jadi judul tidak menahan respons.
  let markStreamDone!: () => void;
  const streamDone = new Promise<void>((res) => {
    markStreamDone = res;
  });
  if (isFirstUserMessage && sessions[0].title === "New chat") {
    const firstUser = history.filter((m) => m.role === "user").pop()?.content ?? content;
    after(async () => {
      await streamDone;
      try {
        const title = await generateTitle(firstUser);
        if (title) {
          await db()`UPDATE sessions SET title = ${title} WHERE id = ${sessionId} AND title = 'New chat'`;
        }
      } catch (e) {
        console.error("title generation failed", e); // fail-open: biarkan 'New chat'
      }
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          const full = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
          const text = extractSseText(full);
          try {
            if (text) {
              await db()`
                INSERT INTO messages (session_id, role, content) VALUES (${sessionId}, 'assistant', ${text})
              `;
              await db()`UPDATE sessions SET updated_at = now() WHERE id = ${sessionId}`;
            }
          } catch (e) {
            console.error("persist assistant failed", e);
          }
          markStreamDone();
          ctrl.close();
          return;
        }
        if (value) {
          chunks.push(value);
          ctrl.enqueue(value);
        }
      } catch (e) {
        console.error("stream pull failed", e);
        markStreamDone();
        ctrl.error(e);
      }
    },
    cancel() {
      abort.abort();
      markStreamDone();
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

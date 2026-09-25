// language: TypeScript, file: app/api/chat/route.ts, target: Vercel Node runtime
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { streamChat, generateTitle, type ChatMsg, type ChatPart } from "@/lib/gateway";
import { allow, clientIp } from "@/lib/rate-limit";
import { checkQuota, estimateTokens } from "@/lib/quota";
import { modelAllowed } from "@/lib/plans";
import { addUsage, quotaState } from "@/lib/subscriptions";
import { runTool, toolLabel, toolSchemas, type ToolResult } from "@/lib/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

const Attachment = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(["image", "text"]),
  mime: z.string().max(80),
  data: z.string().max(8_000_000), // data URL (image) atau teks isi file — foto sisa base64 gampang > 4 juta
});

const Body = z.object({
  sessionId: z.string().uuid(),
  model: z.string().min(1).max(120),
  content: z.string().min(1).max(32_000),
  regenerate: z.boolean().optional(),
  /** Edit prompt user: potong riwayat dari pesan ini lalu generate ulang (efek sama seperti Ulangi) */
  editMessageId: z.string().uuid().optional(),
  attachments: z.array(Attachment).max(6).optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Teks file disematkan inline supaya replay riwayat tetap utuh tanpa menyimpan biner. */
function withTextAttachments(text: string, _files: z.infer<typeof Attachment>[]): string {
  // Permintaan Manuel: dokumen TIDAK ditempel ke prompt — preview lampiran sudah ada di UI,
  // dan isi berkas (mis. .json berisi token) tidak boleh ikut dikirim ke model.
  return text;
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
        `Kamu sedang melayani username "${u.username}" di OnheilAI. Jawab dalam bahasa percakapan user.\n\n` +
        "Kamu PUNYA tool di antarmuka ini: web_search (cari di internet), web_extract (baca isi URL), " +
        "create_file (buat berkas .docx/.pdf/.xlsx/.csv/.txt/.md untuk diunduh user), dan run_command (bila tersedia). " +
        "SEGERA gunakan tool bila permintaan butuh data terkini, isi halaman web, atau pembuatan berkas. " +
        "Jangan pernah menjawab bahwa tool mati, rusak, atau tidak tersedia — jawaban itu salah. " +
        "Kalau sebuah tool memang tidak ada dalam daftar, baru jelaskan dengan singkat alternatifnya. " +
        "GAYA SUMBER: saat mengutip hasil web_search, JANGAN tampilkan URL telanjang dan JANGAN membuat daftar 'Sumber:' berisi link mentah. " +
        "Tautkan kalimat kutipannya sendiri dengan Markdown: [potongan kalimat dari sumber](url). " +
        "Contoh benar: produksi naik 12% [menurut laporan rilis 14 Maret](https://example.com/berita). " +
        "Contoh salah: naik 12% (https://example.com/berita) atau [https://example.com/berita].",
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
    const issue = parsed.error.issues[0];
    const path = (issue?.path ?? []).map(String).join(".");
    // pesan zod berbahasa Inggris ("Too big: ...") jangan sampai tampil ke user
    const detail = path.startsWith("attachments")
      ? "Lampiran terlalu besar untuk dikirim. Kecilkan gambarnya atau pakai file yang lebih kecil."
      : path.startsWith("content")
        ? "Pesan terlalu panjang. Pecah jadi beberapa bagian."
        : "Data tidak valid.";
    return NextResponse.json({ error: "invalid_body", detail }, { status: 400 });
  }
  const { sessionId, model, regenerate, editMessageId, attachments } = parsed.data;
  let { content } = parsed.data;
  const isEdit = Boolean(editMessageId) || Boolean(regenerate);

  // kuota per akun (15 chat / 10 mnt) dan per IP (30 / 10 mnt) — pembatas terakhir
  // setelah gerbang same-origin, supaya kunci gateway tak bisa dikuras skrip.
  if (!allow(`chat-user:${user.id}`, 15) || !allow(`chat-ip:${clientIp(req.headers)}`, 30)) {
    return NextResponse.json(
      { error: "rate_limited", detail: "Terlalu banyak permintaan. Tunggu beberapa menit." },
      { status: 429 },
    );
  }

  // paket langit: model di luar hak akses ditolak di server
  const st0 = await quotaState(user.id);
  if (!modelAllowed(st0.plan, model)) {
    return NextResponse.json({ error: "plan_model_forbidden", plan: st0.plan }, { status: 403 });
  }

  // kuota token: batas harian (default 10 juta/24 jam) atau langganan aktif
  const quota = checkQuota(st0);
  if (!quota.ok) {
    return NextResponse.json({ error: "quota_exceeded", kind: quota.kind }, { status: 429 });
  }

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });

  // 1. sesi harus milik user — selain itu 404
  const sessions = (await db()`
    SELECT id, title FROM sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `) as unknown as { id: string; title: string }[];
  if (!sessions[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const userText = withTextAttachments(content, attachments ?? []);
  const images = (attachments ?? []).filter((a) => a.kind === "image");

  // 2. simpan pesan user
  //    - regenerate: buang jawaban terakhir, prompt tetap
  //    - edit: potong riwayat dari pesan yang diedit, ganti isinya, generate ulang
  if (editMessageId) {
    const target = (await db()`
      SELECT id, created_at, role FROM messages WHERE id = ${editMessageId} AND session_id = ${sessionId}
    `) as unknown as { id: string; created_at: string; role: string }[];
    if (!target[0] || target[0].role !== "user") {
      return NextResponse.json({ error: "message_not_found" }, { status: 404 });
    }
    await db()`
      DELETE FROM messages
      WHERE session_id = ${sessionId}
        AND (created_at, id) >= (
          SELECT created_at, id FROM messages
          WHERE id = ${editMessageId} AND session_id = ${sessionId}
        )
    `;
    await db()`
      INSERT INTO messages (session_id, role, content, attachments)
      VALUES (${sessionId}, 'user', ${userText}, ${JSON.stringify(attachments ?? [])}::jsonb)
    `;
    await db()`UPDATE sessions SET updated_at = now() WHERE id = ${sessionId}`;
  } else if (regenerate) {
    // max(uuid) tidak ada di Postgres -> pakai ORDER BY + LIMIT (akar bug tombol "Ulangi" = 500)
    await db()`
      DELETE FROM messages
      WHERE session_id = ${sessionId}
        AND id = (
          SELECT id FROM messages
          WHERE session_id = ${sessionId} AND role = 'assistant'
          ORDER BY created_at DESC, id DESC
          LIMIT 1
        )
    `;
  } else {
    // preview selalu ada di UI -> lampiran disimpan di messages.attachments (tanpa prefix teks)
    await db()`
      INSERT INTO messages (session_id, role, content, attachments)
      VALUES (${sessionId}, 'user', ${userText}, ${JSON.stringify(attachments ?? [])}::jsonb)
    `;
    await db()`UPDATE sessions SET updated_at = now() WHERE id = ${sessionId}`;
  }

  // 3. riwayat + konteks sistem
  const history = (await db()`
    SELECT role, content, attachments FROM messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC, id ASC
    LIMIT 200
  `) as unknown as { role: ChatMsg["role"]; content: string; attachments: unknown }[];

  const turns: ChatMsg[] = history.map((m) => ({ role: m.role, content: m.content }));

  // gambar hanya untuk giliran ini (tidak disimpan ke DB supaya tidak membengkak)
  // PagU: upstream multimodal gagal membaca base64 besar (terpotong -> "gambar rusak").
  const MAX_IMAGE_CHARS = 1_500_000;
  const oversize = images.filter((i) => i.data.length > MAX_IMAGE_CHARS).length;
  const visionImages = oversize > 0 ? images.filter((i) => i.data.length <= MAX_IMAGE_CHARS) : images;
  if (oversize > 0) content = `${content}\n\n[catatan: ${oversize} gambar dilewati karena terlalu besar]`;
  if (visionImages.length > 0) {
    // sebagian unggahan mengirim base64 polos tanpa prefix -> upstream membacanya sebagai URL/rusak
    const toDataUri = (a: { data: string; mime: string }): string =>
      a.data.startsWith("data:") ? a.data : `data:${a.mime || "image/jpeg"};base64,${a.data.replace(/^base64,/, "")}`;
    const parts: ChatPart[] = [
      { type: "text", text: content },
      ...visionImages.map((i) => ({ type: "image_url" as const, image_url: { url: toDataUri(i) } })),
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
  const needsTitle = sessions[0].title === "New chat" && !isEdit;
  const titlePromise: Promise<string> = needsTitle
    ? generateTitle(
        `Pertanyaan user:\n${String(userText).slice(0, 500)}`,
      ).catch(() => "")
    : Promise.resolve("");

  // 5. streaming dari gateway
  const tools = toolSchemas();
  const toolCtx = { userId: user.id };
  let gateway: Response;
  try {
    gateway = await streamChat(model, messages, abort.signal, tools);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return NextResponse.json(
      { error: "gateway_error", detail: String(e).slice(0, 300) },
      { status: status >= 400 && status < 600 ? status : 502 },
    );
  }

  // putaran tool: kalau model meminta tool, jalankan dulu lalu stream lagi (maksimal 4 ronde)
  let conv: ChatMsg[] = messages;

  let reader = gateway.body!.getReader();
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let lineBuf = "";
  let allText = "";
  let roundText = "";
  let finish: string | null = null;
  const calls: { id: string; name: string; args: string }[] = [];
  let rounds = 0;
  // pemakaian token sesungguhnya dari gateway (bukan perkiraan teks)
  let usageTotal = 0; // akumulasi antar-putaran (ronde tool = request terpisah)
  let usageStream = 0; // tertinggi pada satu stream (event usage boleh berulang)
  const flushUsage = () => {
    usageTotal += usageStream;
    usageStream = 0;
  };

  const parseData = (payload: string) => {
    if (!payload || payload === "[DONE]") return;
    try {
      const obj = JSON.parse(payload) as {
        choices?: {
          delta?: {
            content?: string;
            tool_calls?: { id?: string; index?: number; function?: { name?: string; arguments?: string } }[];
          };
          finish_reason?: string;
        }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const u = obj.usage;
      if (u) {
        const s =
          typeof u.total_tokens === "number"
            ? u.total_tokens
            : (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
        if (Number.isFinite(s) && s > usageStream) usageStream = s;
      }
      const ch = obj.choices?.[0];
      if (!ch) return;
      if (ch.finish_reason) finish = ch.finish_reason;
      if (typeof ch.delta?.content === "string") roundText += ch.delta.content;
      for (const tc of ch.delta?.tool_calls ?? []) {
        const i = tc.index ?? 0;
        if (!calls[i]) calls[i] = { id: tc.id ?? `call_${i}`, name: "", args: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name = tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
    } catch {
      /* potongan tidak valid */
    }
  };

  const feed = (value: Uint8Array) => {
    lineBuf += dec.decode(value, { stream: true });
    const lines = lineBuf.split("\n");
    lineBuf = lines.pop() ?? "";
    for (const line of lines) {
      const s2 = line.trim();
      if (s2.startsWith("data:")) parseData(s2.slice(5).trim());
    }
  };

  /** chip aktivitas tool -> klien (event SSE khusus, diabaikan parser stream biasa) */
  const chip = (name: string, label: string, status: string) =>
    enc.encode(`event: tool\ndata: ${JSON.stringify({ name, label, status })}\n\n`);

  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (value) {
            feed(value);
            ctrl.enqueue(value);
          }
          if (!done) continue;

          const valid = calls.filter((c) => Boolean(c && c.name));
          if (finish === "tool_calls" && valid.length > 0 && rounds < 4) {
            rounds++;
            allText += roundText;
            roundText = "";
            finish = null;
            lineBuf = "";
            calls.length = 0;

            for (const c of valid) ctrl.enqueue(chip(c.name, toolLabel(c.name, c.args), "mulai"));
            const results: ToolResult[] = [];
            for (const c of valid) {
              const r = await runTool(c.name, c.args, toolCtx);
              results.push(r);
              ctrl.enqueue(chip(c.name, toolLabel(c.name, c.args), r.ok ? "selesai" : "gagal"));
            }

            conv = [
              ...conv,
              {
                role: "assistant" as const,
                content: "",
                tool_calls: valid.map((c) => ({
                  id: c.id,
                  type: "function" as const,
                  function: { name: c.name, arguments: c.args },
                })),
              },
              ...valid.map((c, i) => ({
                role: "tool" as const,
                tool_call_id: c.id,
                content: results[i].ok ? results[i].text : `ERROR: ${results[i].error}`,
              })),
            ];
            flushUsage(); // putaran selesai -> akumulasi usage-nya
            // ronde terakhir: TANPA tools supaya model wajib menjawab
            gateway = rounds >= 4
              ? await streamChat(model, conv, abort.signal)
              : await streamChat(model, conv, abort.signal, tools);
            reader = gateway.body!.getReader();
            continue;
          }

          let assistantText = (allText + roundText).trim();

          // kosong setelah putaran tool -> paksa sekali lagi tanpa tools
          if (!assistantText) {
            roundText = "";
            finish = null;
            lineBuf = "";
            calls.length = 0;
            try {
              flushUsage();
              gateway = await streamChat(model, [
                ...conv,
                { role: "user", content: "Jawab sekarang, langsung ke inti tanpa tool." },
              ], abort.signal);
              reader = gateway.body!.getReader();
              const { value, done } = await reader.read();
              if (value) { feed(value); ctrl.enqueue(value); }
              if (!done) continue;
              assistantText = (allText + roundText).trim();
            } catch (e) {
              console.error("forced final failed", e);
            }
          }
          if (!assistantText) {
            assistantText = "Model tidak mengeluarkan teks pada putaran ini. Kirim ulang pertanyaannya.";
            ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: assistantText } }] })}\n\n`));
          }

          try {
            if (assistantText) {
              await db()`
                INSERT INTO messages (session_id, role, content, model) VALUES (${sessionId}, 'assistant', ${assistantText}, ${model})
              `;
              await db()`UPDATE sessions SET updated_at = now() WHERE id = ${sessionId}`;
            }
            flushUsage();
            // angka sesungguhnya dari gateway (prompt+riwayat+reasoning) bila tersedia;
            // kalau tidak, perkiraan dari teks yang terlihat
            const counted =
              usageTotal > 0 ? usageTotal : estimateTokens(assistantText) + estimateTokens(userText);
            await addUsage(user.id, counted);
            if (needsTitle) {
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


/** `usage` dari event SSE (dikirim kalau gateway menyertakannya). null = tidak ada. */
export function extractUsage(raw: string): number | null {
  let total: number | null = null;
  for (const line of raw.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("data:")) continue;
    const payload = s.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const obj = JSON.parse(payload) as {
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const u = obj.usage;
      if (!u) continue;
      const sum =
        typeof u.total_tokens === "number"
          ? u.total_tokens
          : (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
      if (Number.isFinite(sum) && sum > 0) total = sum;
    } catch {
      /* potongan tidak utuh */
    }
  }
  return total;
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

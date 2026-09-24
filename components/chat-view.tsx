// language: TypeScript, file: components/chat-view.tsx, target: client component
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Markdown from "./markdown";

export type Msg = { id?: string; role: "user" | "assistant"; content: string };

type Props = {
  sessionId: string; // 'new' saat chat belum punya row
  title: string;
  model: string;
  initialMessages: Msg[];
};

const DEFAULT_MODEL = "onheil-1.1-luna";

export default function ChatView({ sessionId, title, model, initialMessages }: Props) {
  const router = useRouter();
  const [id, setId] = useState(sessionId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [currentModel, setCurrentModel] = useState(model || DEFAULT_MODEL);
  const [heading, setHeading] = useState(title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // judul yang tampil di tab: judul sesi, atau preview pesan pertama
  const displayTitle = heading === "New chat" ? (messages.find((m) => m.role === "user")?.content.slice(0, 60) ?? "New chat") : heading;

  useEffect(() => {
    document.title = `${displayTitle} — AI`;
  }, [displayTitle]);

  useEffect(() => {
    const onTitle = (e: Event) => {
      const t = (e as CustomEvent<string>).detail;
      setHeading(t);
      setTitleDraft(t);
    };
    window.addEventListener("session-title-changed", onTitle);
    return () => window.removeEventListener("session-title-changed", onTitle);
  }, []);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((b: { models?: { id: string; label: string }[] }) => {
        if (b.models?.length) setModels(b.models);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamText]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [input]);

  // draft dari landing page (chat pertama)
  useEffect(() => {
    const raw = sessionStorage.getItem("draft");
    if (!raw || streaming) return;
    sessionStorage.removeItem("draft");
    try {
      const d = JSON.parse(raw) as { content: string; model?: string };
      if (d.model) setCurrentModel(d.model);
      void send(d.content, d.model || currentModel);
    } catch {
      /* draft rusak — abaikan */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function streamChat(sid: string, mdl: string, content: string, regenerate = false) {
    setError("");
    setStreaming(true);
    setStreamText("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, model: mdl, content, regenerate }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        setError(body.detail ? `Gateway menolak: ${body.detail}` : `Gagal (${res.status})`);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith("data:")) continue;
          const payload = s.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const piece = obj.choices?.[0]?.delta?.content;
            if (typeof piece === "string") {
              acc += piece;
              setStreamText(acc);
            }
          } catch {
            /* potongan tidak utuh — lewati */
          }
        }
      }

      if (regenerate) {
        setMessages((prev) => {
          const copy = [...prev];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === "assistant") {
              copy[i] = { ...copy[i], content: acc };
              break;
            }
          }
          return copy;
        });
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: acc }]);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Koneksi terputus — coba lagi.");
    } finally {
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function send(content: string, mdl: string, regenerate = false) {
    if (streaming || !content.trim()) return;
    setInput("");

    let sid = id;

    if (sid === "new") {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: mdl }),
      });
      if (!res.ok) {
        setError("Gagal membuat sesi.");
        return;
      }
      const body = (await res.json()) as { session: { id: string; title: string } };
      sid = body.session.id;
      setId(sid);
    }

    if (!regenerate) {
      setMessages((prev) => [...prev, { role: "user", content }]);
    }

    await streamChat(sid, mdl, content, regenerate);

    if (id === "new") {
      router.replace(`/c/${sid}`);
      router.refresh();
    }
    window.dispatchEvent(new Event("sessions-changed"));
  }

  async function saveTitle() {
    setEditingTitle(false);
    const t = titleDraft.trim();
    if (!t || id === "new") return;
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    if (res.ok) {
      setHeading(t);
      window.dispatchEvent(new Event("sessions-changed"));
    }
  }

  function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    void send(lastUser.content, currentModel, true);
  }

  const empty = messages.length === 0 && !streaming && !streamText;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* topbar */}
      <header className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 pl-12 md:pl-4">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              className="w-full max-w-md rounded-md border border-[#facc15] bg-transparent px-2 py-1 text-sm outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setTitleDraft(heading);
                setEditingTitle(true);
              }}
              className="max-w-full truncate rounded-md px-2 py-1 text-left text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
              title="Klik untuk ubah judul"
            >
              {displayTitle}
            </button>
          )}
        </div>

        <select
          value={currentModel}
          onChange={(e) => setCurrentModel(e.target.value)}
          className="max-w-[180px] truncate rounded-lg border border-[var(--border)] bg-[var(--sidebar)] px-2 py-1.5 text-xs outline-none focus:border-[#facc15]"
        >
          {(models.length ? models : [{ id: currentModel, label: currentModel }]).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </header>

      {/* thread */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="h-9 w-9 rounded-lg bg-[#facc15]" />
            <h2 className="text-xl font-semibold">Mulai percakapan</h2>
            <p className="text-sm text-[var(--muted)]">Ketik pesan di bawah — sesi dibuat otomatis.</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((m, i) => (
              <div key={m.id ?? i} className={`mb-6 ${m.role === "user" ? "flex justify-end" : ""}`}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-3xl border border-[#facc15]/40 bg-[#facc15]/10 px-4 py-2.5 text-[15px] whitespace-pre-wrap">
                    {m.content}
                  </div>
                ) : (
                  <div className="group">
                    <Markdown>{m.content}</Markdown>
                    <div className="mt-2 flex gap-2 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => navigator.clipboard.writeText(m.content)}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--fg)]"
                      >
                        Salin
                      </button>
                      {i === messages.length - 1 && !streaming ? (
                        <button
                          onClick={regenerate}
                          className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--fg)]"
                        >
                          Buat ulang
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {streamText ? (
              <div className="mb-6">
                <Markdown>{streamText}</Markdown>
                <span className="mt-1 inline-block h-4 w-2 animate-pulse bg-[#facc15]" />
              </div>
            ) : null}

            {error ? <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p> : null}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="border-t border-[var(--border)] bg-[var(--bg)] px-3 pb-4 pt-3">
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--sidebar)] px-3 py-2">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input, currentModel);
              }
            }}
            rows={1}
            placeholder="Kirim pesan…"
            className="max-h-[240px] w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-[var(--muted)]">Enter kirim · Shift+Enter baris baru</span>
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                ■ Berhenti
              </button>
            ) : (
              <button
                onClick={() => void send(input, currentModel)}
                disabled={!input.trim()}
                className="rounded-lg bg-[#facc15] px-4 py-1.5 text-sm font-semibold text-black transition disabled:opacity-40"
              >
                Kirim
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

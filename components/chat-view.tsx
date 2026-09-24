// language: TypeScript, file: components/chat-view.tsx, target: client component
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
  ArrowUp,
  Copy,
  PencilSimple,
  Prohibit,
} from "@phosphor-icons/react";
import Markdown from "./markdown";
import { BrandMark } from "./sidebar";

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

  const firstUser = messages.find((m) => m.role === "user")?.content.slice(0, 60);
  const displayTitle = heading === "New chat" ? (firstUser ?? "Chat baru") : heading;

  useEffect(() => {
    document.title = `${displayTitle} · AI`;
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
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [input]);

  // draft dari halaman awal (chat pertama)
  useEffect(() => {
    const raw = sessionStorage.getItem("draft");
    if (!raw || streaming) return;
    sessionStorage.removeItem("draft");
    try {
      const d = JSON.parse(raw) as { content: string; model?: string };
      if (d.model) setCurrentModel(d.model);
      void send(d.content, d.model || currentModel);
    } catch {
      /* draft rusak */
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
            /* potongan tidak utuh */
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
      if ((e as Error).name !== "AbortError") setError("Koneksi terputus, coba lagi.");
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
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-5">
        <div className="min-w-0 flex-1 pl-9 sm:pl-0">
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
              className="w-full max-w-md rounded-xl border border-[var(--accent)] bg-[var(--panel)] px-3 py-1.5 text-sm outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setTitleDraft(heading);
                setEditingTitle(true);
              }}
              className="group flex max-w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--border)]/50"
              title="Ubah judul sesi"
            >
              <span className="truncate text-sm font-medium tracking-tight">{displayTitle}</span>
              <PencilSimple
                size={13}
                className="shrink-0 text-[var(--faint)] opacity-0 transition group-hover:opacity-100"
              />
            </button>
          )}
        </div>

        <select
          value={currentModel}
          onChange={(e) => setCurrentModel(e.target.value)}
          aria-label="Pilih model"
          className="max-w-[170px] truncate rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--fg)] focus:outline-none"
        >
          {(models.length ? models : [{ id: currentModel, label: currentModel }]).map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center px-5 py-10 sm:px-8">
            <div className="fade-up">
              <BrandMark size={30} />
              <h2 className="mt-5 text-[24px] font-semibold tracking-tight sm:text-[30px]">
                Mulai percakapan
              </h2>
              <p className="mt-2 max-w-[46ch] text-[15px] text-[var(--muted)]">
                Pertanyaan pertama kamu membuat sesi ini tersimpan, lengkap dengan judulnya.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-8">
            {messages.map((m, i) => (
              <div key={m.id ?? i} className="mb-7">
                {m.role === "user" ? (
                  <div className="flex justify-end">
                    <div className="max-w-[86%] whitespace-pre-wrap rounded-xl border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[15px]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div className="group flex gap-3.5">
                    <span className="mt-0.5 hidden shrink-0 sm:block">
                      <BrandMark size={24} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Markdown>{m.content}</Markdown>
                      <div className="mt-2.5 flex gap-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={() => navigator.clipboard.writeText(m.content)}
                          title="Salin jawaban"
                          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                        >
                          <Copy size={13} /> Salin
                        </button>
                        {i === messages.length - 1 && !streaming ? (
                          <button
                            onClick={regenerate}
                            title="Buat ulang jawaban"
                            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                          >
                            <ArrowsClockwise size={13} /> Ulangi
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {streamText ? (
              <div className="mb-7 flex gap-3.5">
                <span className="mt-0.5 hidden shrink-0 sm:block">
                  <BrandMark size={24} />
                </span>
                <div className="min-w-0 flex-1">
                  <Markdown>{streamText}</Markdown>
                  <span className="caret" aria-hidden />
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="mb-5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_45%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-2.5 text-sm text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg)] px-5 pb-5 pt-4">
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition focus-within:border-[var(--border-strong)] focus-within:shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
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
            placeholder="Tulis pesan…"
            className="max-h-[220px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none"
          />
          <div className="mt-1 flex items-center justify-between px-1">
            <span className="hidden text-xs text-[var(--faint)] sm:inline">
              Enter kirim, Shift+Enter baris baru
            </span>
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--fg)] active:scale-95"
              >
                <Prohibit size={14} /> Berhenti
              </button>
            ) : (
              <button
                onClick={() => void send(input, currentModel)}
                disabled={!input.trim()}
                aria-label="Kirim pesan"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] transition hover:brightness-95 active:scale-95 disabled:opacity-35"
              >
                <ArrowUp size={17} weight="bold" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

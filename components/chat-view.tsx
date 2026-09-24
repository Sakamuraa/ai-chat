// language: TypeScript, file: components/chat-view.tsx, target: client component
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
  ArrowUp,
  Copy,
  Image as ImageIcon,
  Paperclip,
  PencilSimple,
  Plus,
  Prohibit,
  X,
} from "@phosphor-icons/react";
import Markdown from "./markdown";
import { BrandMark } from "./sidebar";
import ModelSelect, { MODELS } from "./model-select";
import { useI18n } from "./i18n";
import { classifyFile, MAX_MB, type Attachment } from "@/lib/attachments";

export type Msg = { id?: string; role: "user" | "assistant"; content: string };

type Props = {
  sessionId: string;
  title: string;
  model: string;
  initialMessages: Msg[];
};

export default function ChatView({ sessionId, title, model, initialMessages }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [id, setId] = useState(sessionId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [currentModel, setCurrentModel] = useState(
    MODELS.some((m) => m.id === model) ? model : MODELS[0].id,
  );
  const [heading, setHeading] = useState(title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  // riwayat prompt untuk navigasi Up/Down
  const historyRef = useRef<string[]>(initialMessages.filter((m) => m.role === "user").map((m) => m.content));
  const histIdx = useRef<number>(-1);

  const firstUser = messages.find((m) => m.role === "user")?.content.slice(0, 60);
  const displayTitle = heading === "New chat" ? (firstUser ?? "Chat baru") : heading;

  useEffect(() => {
    document.title = `${displayTitle} · OnheilAI`;
  }, [displayTitle]);

  useEffect(() => {
    const onTitle = (e: Event) => {
      const t2 = (e as CustomEvent<string>).detail;
      setHeading(t2);
      setTitleDraft(t2);
    };
    // judul sesi dibuat backend setelah jawaban pertama -> tarik lagi supaya header & sidebar sama
    const refreshTitle = async () => {
      if (id === "new") return;
      try {
        const res = await fetch(`/api/sessions/${id}`);
        if (!res.ok) return;
        const body = (await res.json()) as { session?: { title?: string } };
        const title = body.session?.title;
        if (title && title !== "New chat") {
          setHeading(title);
          setTitleDraft(title);
        }
      } catch {
        /* diam */
      }
    };
    window.addEventListener("session-title-changed", onTitle);
    window.addEventListener("sessions-changed", refreshTitle);
    return () => {
      window.removeEventListener("session-title-changed", onTitle);
      window.removeEventListener("sessions-changed", refreshTitle);
    };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamText]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [input]);

  // hint berputar selama AI belum mengeluarkan token pertama (gaya claude.ai)
  useEffect(() => {
    if (!streaming || streamText) return;
    const iv = setInterval(() => setHintIdx((i) => (i + 1) % 4), 1900);
    return () => clearInterval(iv);
  }, [streaming, streamText]);

  // draft dari halaman awal (chat pertama)
  useEffect(() => {
    const raw = sessionStorage.getItem("draft");
    if (!raw || streaming) return;
    sessionStorage.removeItem("draft");
    try {
      const d = JSON.parse(raw) as { content: string; model?: string; attachments?: Attachment[] };
      if (d.model) setCurrentModel(d.model);
      const mdl = d.model && MODELS.some((m) => m.id === d.model) ? d.model : MODELS[0].id;
      void send(d.content, mdl, Array.isArray(d.attachments) ? d.attachments : []);
    } catch {
      /* draft rusak */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickFiles(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(t("chat.attachTooBig", { mb: MAX_MB }));
        continue;
      }
      const cls = classifyFile(file.name, file.type);
      if (cls === "unsupported") {
        setError(t("chat.attachUnsupported"));
        continue;
      }
      const isImage = cls === "image";
      setError("");
      const data = isImage
        ? await new Promise<string>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.onerror = () => rej(r.error);
            r.readAsDataURL(file);
          })
        : await file.text();
      setAttachments((prev) =>
        prev.length >= 6 ? prev : [...prev, { name: file.name, kind: isImage ? "image" : "text", mime: file.type || "text/plain", data }],
      );
    }
  }

  function keyHistory(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const el = e.currentTarget;
    const atTop = el.selectionStart === 0 && el.selectionEnd === 0;
    const atBottom = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    const oneLine = !el.value.includes("\n");

    if (e.key === "ArrowUp" && (atTop || (oneLine && histIdx.current !== -1))) {
      if (historyRef.current.length === 0) return;
      e.preventDefault();
      const next = histIdx.current === -1 ? historyRef.current.length - 1 : Math.max(0, histIdx.current - 1);
      histIdx.current = next;
      setInput(historyRef.current[next]);
    } else if (e.key === "ArrowDown" && histIdx.current !== -1 && (atBottom || oneLine)) {
      e.preventDefault();
      const next = histIdx.current + 1;
      if (next >= historyRef.current.length) {
        histIdx.current = -1;
        setInput("");
      } else {
        histIdx.current = next;
        setInput(historyRef.current[next]);
      }
    }
  }

  async function streamChat(sid: string, mdl: string, content: string, files: Attachment[], regenerate = false) {
    setError("");
    setStreaming(true);
    setStreamText("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          model: mdl,
          content,
          regenerate,
          attachments: files.length > 0 ? files : undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; kind?: string };
        if (body.error === "rate_limited") {
          setError(t("chat.rateLimited"));
        } else if (body.error === "quota_exceeded") {
          setError(body.kind === "sub_exhausted" ? t("chat.quotaSub") : t("chat.quotaDaily", { n: "10.000.000" }));
        } else {
          setError(body.detail ? `${body.detail}` : `Error ${res.status}`);
        }
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
      if ((e as Error).name !== "AbortError") setError(t("chat.disconnected"));
    } finally {
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function send(content: string, mdl: string, files: Attachment[] = [], regenerate = false) {
    if (streaming || (!content.trim() && files.length === 0)) return;
    setInput("");
    setAttachments([]);
    histIdx.current = -1;
    if (!regenerate) historyRef.current.push(content);

    let sid = id;

    if (sid === "new") {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: mdl }),
      });
      if (!res.ok) {
        setError(t("chat.sessionFailed"));
        return;
      }
      const body = (await res.json()) as { session: { id: string } };
      sid = body.session.id;
      setId(sid);
    }

    if (!regenerate) {
      setMessages((prev) => [...prev, { role: "user", content }]);
    }

    await streamChat(sid, mdl, content, files, regenerate);

    if (id === "new") {
      router.replace(`/c/${sid}`);
      router.refresh();
    }
    window.dispatchEvent(new Event("sessions-changed"));
  }

  async function saveTitle() {
    setEditingTitle(false);
    const tt = titleDraft.trim();
    if (!tt || id === "new") return;
    const res = await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: tt }),
    });
    if (res.ok) {
      setHeading(tt);
      window.dispatchEvent(new Event("sessions-changed"));
    }
  }

  function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    void send(lastUser.content, currentModel, [], true);
  }

  const empty = messages.length === 0 && !streaming && !streamText;
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  }, [messages]);

  const hints = [t("chat.hint1"), t("chat.hint2"), t("chat.hint3"), t("chat.hint4")];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="chat-header flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-5">
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
              className="w-full max-w-md rounded-xl border border-[var(--accent)] bg-[var(--panel)] px-3 py-1.5 text-sm outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setTitleDraft(heading);
                setEditingTitle(true);
              }}
              className="group flex max-w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[var(--border)]/50"
              title={t("nav.editTitle")}
            >
              <span className="truncate text-sm font-medium tracking-tight">{displayTitle}</span>
              <PencilSimple
                size={13}
                className="shrink-0 text-[var(--faint)] opacity-0 transition group-hover:opacity-100"
              />
            </button>
          )}
        </div>

        <ModelSelect value={currentModel} onChange={setCurrentModel} label={t("profile.model")} direction="down" />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center px-5 py-10 sm:px-8">
            <div className="fade-up">
              <BrandMark size={30} />
              <h2 className="mt-5 text-[24px] font-semibold tracking-tight sm:text-[30px]">
                {t("chat.emptyTitle")}
              </h2>
              <p className="mt-2 max-w-[46ch] text-[15px] text-[var(--muted)]">{t("chat.emptySub")}</p>
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

                      {/* disclaimer hanya di respons paling akhir */}
                      {i === lastAssistantIdx && !streaming ? (
                        <p className="mt-3 text-xs text-[var(--faint)]">{t("chat.disclaimer")}</p>
                      ) : null}

                      <div className="mt-2.5 flex gap-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(m.content);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1600);
                          }}
                          title={copied ? t("chat.copied") : t("chat.copy")}
                          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                        >
                          <Copy size={13} /> {copied ? t("chat.copied") : t("chat.copy")}
                        </button>
                        {i === messages.length - 1 && !streaming ? (
                          <button
                            onClick={regenerate}
                            title={t("chat.regenerate")}
                            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                          >
                            <ArrowsClockwise size={13} /> {t("chat.regenerate")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* loading: indikator berpikir sebelum token pertama (gaya claude.ai) */}
            {streaming && !streamText ? (
              <div className="mb-7 flex items-start gap-3.5">
                <span className="mt-0.5 hidden shrink-0 sm:block">
                  <span className="block animate-pulse">
                    <BrandMark size={24} />
                  </span>
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-[15px] font-medium text-[var(--fg)]">{t("chat.thinking")}</p>
                  <p key={hintIdx} className="fade-up mt-1 text-sm text-[var(--muted)]">{hints[hintIdx]}</p>
                  <div className="mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-[var(--border)]">
                    <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
                  </div>
                </div>
              </div>
            ) : null}

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

      {/* composer */}
      <div className="border-t border-[var(--border)] bg-[var(--bg)] px-5 pb-5 pt-4">
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition focus-within:border-[var(--border-strong)] focus-within:shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
          {attachments.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-2 px-1">
              {attachments.map((a, i) => (
                <span
                  key={`${a.name}-${i}`}
                  className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--sidebar)] py-1 pl-2.5 pr-1 text-xs text-[var(--muted)]"
                >
                  {a.kind === "image" ? <ImageIcon size={13} /> : <Paperclip size={13} />}
                  <span className="truncate">{a.name}</span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={t("chat.removeAttachment", { name: a.name })}
                    className="rounded-full p-1 hover:text-[var(--danger)]"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              histIdx.current = -1;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input, currentModel, attachments);
                return;
              }
              keyHistory(e);
            }}
            rows={1}
            placeholder={t("chat.placeholder")}
            className="max-h-[220px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none"
          />

          <div className="mt-1 flex items-center gap-2 px-1">
            <div className="relative">
              <button
                onClick={() => setAttachMenu((v) => !v)}
                aria-label={t("chat.attach")}
                title={t("chat.attach")}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
              >
                <Plus size={16} weight="bold" />
              </button>
              {attachMenu ? (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setAttachMenu(false)} />
                  <div className="fade-up absolute bottom-[calc(100%+8px)] left-0 z-30 w-[210px] rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)]">
                    <button
                      onClick={() => {
                        setAttachMenu(false);
                        imgRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
                    >
                      <ImageIcon size={15} /> Foto
                    </button>
                    <button
                      onClick={() => {
                        setAttachMenu(false);
                        docRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
                    >
                      <Paperclip size={15} /> Dokumen
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            <input
              ref={imgRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={docRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                void pickFiles(e.target.files);
                e.target.value = "";
              }}
            />

            <span className="hidden text-xs text-[var(--faint)] sm:inline">
              {t("landing.enterHint")}
            </span>

            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3.5 py-1.5 text-sm font-medium text-[var(--muted)] transition hover:text-[var(--fg)] active:scale-95"
              >
                <Prohibit size={14} /> {t("chat.stop")}
              </button>
            ) : (
              <button
                onClick={() => void send(input, currentModel, attachments)}
                disabled={!input.trim() && attachments.length === 0}
                aria-label={t("chat.send")}
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

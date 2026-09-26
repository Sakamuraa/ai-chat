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
  Plus,
  Prohibit,
  ShareNetwork,
  X,
  PencilSimple,
} from "@phosphor-icons/react";
import Markdown from "./markdown";
import AttachmentPreview from "./attachment-preview";
import { BrandMark } from "./sidebar";
import ModelSelect, { MODELS, modelsFor, modelLabel as displayModel, type ModelOption } from "./model-select";
import { useI18n } from "./i18n";
import type { Attachment } from "@/lib/attachments";

export type Msg = {
  id?: string;
  role: "user" | "assistant";
  /** id model yang menjawab (dipakai label display) */
  model?: string | null;
  content: string;
  attachments?: Attachment[];
};

type Props = {
  sessionId: string;
  title: string;
  model: string;
  initialMessages: Msg[];
  /** tautan bagikan /s/<id> — tampil hanya-baca, fungsi menulis dimatikan */
  readOnly?: boolean;
  /** pemilik sesi: boleh menyalakan/mematikan berbagi */
  owner?: boolean;
};

type UiAttachment = Attachment;

/** "membaca https://game8.co/games/..." -> "membaca game8.co" (baris tetap satu) */
function shortStepLabel(label: string): string {
  const m = label.match(/^(.*?)(https?:\/\/\S+)/);
  if (!m) return label;
  let host = "";
  try {
    host = new URL(m[2]).hostname.replace(/^www\./, "");
  } catch {
    host = "…";
  }
  return `${m[1].trimEnd()} ${host}`;
}

export default function ChatView({ sessionId, title, model, initialMessages, readOnly = false, owner = false }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [id, setId] = useState(sessionId);
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  // langkah tool (mencari / membaca / membuat berkas) selama stream berjalan
  const [toolSteps, setToolSteps] = useState<{ label: string; status: string }[]>([]);
  // satu baris (gaya Gemini/Kimi): teks langkahnya yang berganti dengan animasi
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState("");
  const [options, setOptions] = useState<ModelOption[]>([...MODELS]);
  // model terakhir dipilih disimpan di localStorage supaya halaman sesi tak kembali ke model awal
  const [currentModel, setCurrentModel] = useState<string>(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("onheil.model");
    } catch {
      saved = null;
    }
    return saved || model || MODELS[0].id;
  });
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [heading, setHeading] = useState(title);
  const [attachments, setAttachments] = useState<UiAttachment[]>([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  // fase sebelum token pertama: 0 = baris ack "Saya cek dulu…", 1 = kartu thinking
  const [ackPhase, setAckPhase] = useState(0);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [shareOn, setShareOn] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<string[]>(
    initialMessages.filter((m) => m.role === "user").map((m) => m.content),
  );
  const histIdx = useRef<number>(-1);

  const firstUser = messages.find((m) => m.role === "user")?.content.slice(0, 60);
  const displayTitle = heading === "New chat" ? (firstUser ?? "Chat baru") : heading;

  useEffect(() => {
    document.title = `${displayTitle} · OnheilAI`;
  }, [displayTitle]);

  // paket langit: daftar model yang boleh dipakai datang dari server
  useEffect(() => {
    if (readOnly) return;
    fetch("/api/subscriptions/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { models?: string[]; plan?: string } | null) => {
        if (b?.models?.length) {
          const allowed = MODELS.filter((m) => b.models!.includes(m.id));
          // ketiga model tetap ditampil; yang di luar paket dikunci berlabel Pro/Max
          setOptions([...MODELS]);
          setLockedIds(MODELS.filter((m) => !b.models!.includes(m.id)).map((m) => m.id));
          // paksa model aktif ikut hak akses paket
          setCurrentModel((cur) => (allowed.some((m) => m.id === cur) ? cur : allowed[0].id));
        }
      })
      .catch(() => {});
  }, [readOnly]);

  // status bagikan milik sendiri
  useEffect(() => {
    if (!owner || readOnly) return;
    fetch(`/api/sessions/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { session?: { share_enabled?: boolean } } | null) => setShareOn(Boolean(b?.session?.share_enabled)))
      .catch(() => {});
  }, [id, owner, readOnly]);

  useEffect(() => {
    const onTitle = (e: Event) => {
      const tt = (e as CustomEvent<string>).detail;
      setHeading(tt);
    };
    window.addEventListener("session-title-changed", onTitle);
    return () => window.removeEventListener("session-title-changed", onTitle);
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

  useEffect(() => {
    if (!streaming || streamText) return;
    const iv = setInterval(() => setHintIdx((i) => (i + 1) % 4), 1900);
    return () => clearInterval(iv);
  }, [streaming, streamText]);

  // langkah tool: ganti teks tiap 1,3 detik selama stream, berhenti di langkah terakhir
  useEffect(() => {
    if (toolSteps.length === 0) {
      setStepIdx(0);
      return;
    }
    if (!streaming) {
      setStepIdx(toolSteps.length - 1);
      return;
    }
    setStepIdx((i) => Math.min(i, toolSteps.length - 1));
    const iv = setInterval(() => setStepIdx((i) => (i + 1) % toolSteps.length), 1300);
    return () => clearInterval(iv);
  }, [toolSteps.length, streaming]);

  // draft dari halaman awal (chat pertama) — dilewati di mode hanya-baca
  useEffect(() => {
    if (readOnly) return;
    const raw = sessionStorage.getItem("draft");
    if (!raw || streaming) return;
    sessionStorage.removeItem("draft");
    try {
      const d = JSON.parse(raw) as { content: string; model?: string; attachments?: UiAttachment[] };
      if (d.model) setCurrentModel(d.model);
      void send(d.content, d.model && options.some((m) => m.id === d.model) ? d.model : options[0].id,
        Array.isArray(d.attachments) ? d.attachments : []);
    } catch {
      /* draft rusak */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


async function pickFiles(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      if (file.size > 5 * 1024 * 1024) {
        setError(t("chat.attachTooBig", { mb: 5 }));
        continue;
      }
      const { classifyFile } = await import("@/lib/attachments");
      const cls = classifyFile(file.name, file.type);
      if (cls === "unsupported") {
        setError(t("chat.attachUnsupported"));
        continue;
      }
      setError("");
      const { compressImage, upscaleTiny } = await import("@/lib/attachments");
      const data = cls === "image" ? await upscaleTiny(await compressImage(file)) : await file.text();
      setAttachments((prev) =>
        prev.length >= 6
          ? prev
          : [...prev, { name: file.name, kind: cls === "image" ? "image" : "text", mime: file.type || "text/plain", data }],
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

  function persistModel(m: string) {
    setCurrentModel(m);
    try {
      localStorage.setItem("onheil.model", m);
    } catch {
      /* storage diblokir — abaikan */
    }
  }

  async function callChat(payload: Record<string, unknown>): Promise<string> {
    setError("");
    setStreaming(true);
    setStreamText("");
    setToolSteps([]);
    setAckPhase(0);
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    ackTimerRef.current = setTimeout(() => setAckPhase(1), 2200);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string; kind?: string };
        if (body.error === "rate_limited") setError(t("chat.rateLimited"));
        else if (body.error === "quota_exceeded")
          setError(body.kind === "sub_exhausted" ? t("chat.quotaSub") : t("chat.quotaDaily", { n: "10.000.000" }));
        else if (body.error === "plan_model_forbidden") setError(t("chat.planForbidden"));
        else setError(body.detail ? `${body.detail}` : `Error ${res.status}`);
        return "";
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      let evt = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const s = line.trim();
          if (s.startsWith("event:")) {
            evt = s.slice(6).trim();
            continue;
          }
          if (!s.startsWith("data:")) continue;
          const payload2 = s.slice(5).trim();
          if (!payload2 || payload2 === "[DONE]") {
            evt = "";
            continue;
          }
          if (evt === "tool") {
            evt = "";
            try {
              const step = JSON.parse(payload2) as { label: string; status: string };
              setToolSteps((prev) => {
                const idx = prev.map((x) => x.label).lastIndexOf(step.label);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = step;
                  return copy;
                }
                return [...prev, step];
              });
            } catch {
              /* langkah tidak utuh */
            }
            continue;
          }
          evt = "";
          try {
            const obj = JSON.parse(payload2) as { choices?: { delta?: { content?: string } }[] };
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
      return acc;
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(t("chat.disconnected"));
      return "";
    } finally {
      if (ackTimerRef.current) {
        clearTimeout(ackTimerRef.current);
        ackTimerRef.current = null;
      }
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function send(
    content: string,
    mdl: string,
    files: UiAttachment[] = [],
    opts: { regenerate?: boolean; editIndex?: number } = {},
  ) {
    if (readOnly || streaming || (!content.trim() && files.length === 0)) return;
    // kosongkan komposer SELALU — dulu terbalik (hanya saat input sudah kosong),
    // sehingga prompt + lampiran menumpuk di input setelah submit
    setInput("");
    setAttachments([]);
    histIdx.current = -1;

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

    if (!opts.regenerate && opts.editIndex === undefined) {
      historyRef.current.push(content);
      setMessages((prev) => [...prev, { role: "user", content, attachments: files }]);
    }

    // riwayat dikirim: untuk edit, potong tampilan sampai pesan itu
    let sentBase: Msg[] = messages;
    // id pesan ASLI sebelum diganti — sentBase[editIndex] nanti berisi objek baru tanpa id,
    // kalau tidak disimpan di sini editMessageId terkirim undefined dan server
    // menganggapnya chat baru (prompt lama tidak hilang, yang baru menempel di bawah)
    const editedId = opts.editIndex !== undefined ? messages[opts.editIndex]?.id : undefined;
    if (opts.editIndex !== undefined) {
      sentBase = [...messages.slice(0, opts.editIndex), { role: "user", content, attachments: files }];
      historyRef.current = sentBase.filter((m) => m.role === "user").map((m) => m.content);
      setMessages(sentBase);
      setEditingIdx(null);
    } else if (opts.regenerate) {
      const copy = [...messages];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === "assistant") {
          copy.splice(i, 1);
          break;
        }
      }
      sentBase = copy;
      setMessages(copy);
    }

    const acc = await callChat({
      sessionId: sid,
      model: mdl,
      content,
      regenerate: opts.regenerate || undefined,
      editMessageId: editedId,
      attachments: files.length > 0 ? files : undefined,
    });
    if (acc) setMessages((prev) => [...prev, { role: "assistant", content: acc }]);

    if (id === "new") {
      router.replace(`/c/${sid}`);
      router.refresh();
    }
    window.dispatchEvent(new Event("sessions-changed"));

    // ambil ulang pesan dari server: pesan yang baru dibuat tidak punya id di sisi klien,
    // padahal tombol "Ubah" & lampiran permanen bergantung pada id
    try {
      const res = await fetch(`/api/sessions/${sid}`);
      if (res.ok) {
        const body = (await res.json()) as {
          messages: { id: string; role: Msg["role"]; content: string; attachments?: Attachment[] | null }[];
        };
        setMessages(body.messages.map((m) => ({ ...m, attachments: m.attachments ?? [] })));
      }
    } catch {
      /* tampilan lokal sudah cukup */
    }
  }

  async function toggleShare() {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ share: !shareOn }),
      });
      if (!res.ok) return;
      const body = (await res.json()) as { session: { share_enabled: boolean } };
      setShareOn(body.session.share_enabled);
      if (body.session.share_enabled) {
        await navigator.clipboard.writeText(`${location.origin}/s/${id}`);
        window.dispatchEvent(new CustomEvent("toast", { detail: t("chat.shareCopied") }));
      }
    } finally {
      setShareBusy(false);
    }
  }

  const empty = messages.length === 0 && !streaming && !streamText;
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  }, [messages]);
  const hints = [t("chat.hint1"), t("chat.hint2"), t("chat.hint3"), t("chat.hint4")];
  const modelLabel = options.find((m) => m.id === currentModel)?.label ?? currentModel;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="chat-header flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight" title={displayTitle}>
            {displayTitle}
          </p>
          {readOnly ? (
            <p className="truncate text-[11px] text-[var(--faint)]">{modelLabel}</p>
          ) : null}
        </div>

        {readOnly ? null : (
          <>
            {owner && id !== "new" ? (
              <button
                onClick={() => void toggleShare()}
                disabled={shareBusy}
                title={shareOn ? t("chat.shareOff") : t("chat.share")}
                aria-label={shareOn ? t("chat.shareOff") : t("chat.share")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  shareOn
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--fg)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)]"
                }`}
              >
                <ShareNetwork size={13} />
                {shareOn ? t("chat.shareOn") : t("chat.share")}
              </button>
            ) : null}
            <ModelSelect
              value={currentModel}
              onChange={persistModel}
              lockedIds={lockedIds}
              label={t("profile.model")}
              direction="down"
              models={options}
            />
          </>
        )}
      </header>

      {readOnly ? (
        <div className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-2 text-center text-xs text-[var(--muted)]">
          {t("chat.readOnlyBanner")}
        </div>
      ) : null}

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
              <div key={m.id ?? i} className="mb-7 group/msg">
                {m.role === "user" ? (
                  <div className="flex flex-col items-end">
                    <div className="max-w-[86%] rounded-xl border border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[var(--accent-soft)] px-4 py-2.5 text-[15px]">
                      {editingIdx === i ? (
                        <textarea
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              if (m.id) void send(editDraft, currentModel, m.attachments ?? [], { editIndex: i });
                            }
                            if (e.key === "Escape") setEditingIdx(null);
                          }}
                          rows={Math.min(8, editDraft.split("\n").length + 1)}
                          className="w-full min-w-[260px] resize-none bg-transparent text-[15px] text-[var(--fg)] outline-none"
                        />
                      ) : (
                        <div className="whitespace-pre-wrap">{m.content}</div>
                      )}
                    </div>

                    {m.attachments && m.attachments.length > 0 ? (
                      <div className="mt-2 max-w-[86%]">
                        <AttachmentPreview attachments={m.attachments} compact messageId={m.id} />
                      </div>
                    ) : null}

                    {editingIdx === i ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => m.id && void send(editDraft, currentModel, m.attachments ?? [], { editIndex: i })}
                          disabled={!editDraft.trim()}
                          className="rounded-full bg-[var(--accent)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent-fg)] transition disabled:opacity-45"
                        >
                          {t("chat.saveRegen")}
                        </button>
                        <button
                          onClick={() => setEditingIdx(null)}
                          className="rounded-full border border-[var(--border)] px-3.5 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                        >
                          {t("chat.cancel")}
                        </button>
                      </div>
                    ) : readOnly ? null : (
                      <div className="mt-2 flex gap-1.5 opacity-0 transition group-hover/msg:opacity-100 focus-within:opacity-100">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(m.content);
                            setCopiedId(m.id ?? String(i));
                            setTimeout(() => setCopiedId(null), 1600);
                          }}
                          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                        >
                          <Copy size={13} /> {copiedId === (m.id ?? String(i)) ? t("chat.copied") : t("chat.copy")}
                        </button>
                        {m.id ? (
                          <button
                            onClick={() => {
                              setEditingIdx(i);
                              setEditDraft(m.content);
                            }}
                            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                          >
                            <PencilSimple size={13} /> {t("chat.edit")}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-3.5">
                    <span className="mt-0.5 hidden shrink-0 sm:block">
                      <BrandMark size={24} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Markdown>{m.content}</Markdown>
                      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-[var(--faint)]">
                        <span className="font-medium">{displayModel(m.model ?? currentModel)}</span>
                        {i === lastAssistantIdx && !streaming ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[11px] normal-case tracking-normal">
                              {t("chat.disclaimer")}
                            </span>
                          </>
                        ) : null}
                      </div>

                      {readOnly ? null : (
                        <div className="mt-2.5 flex gap-1.5 opacity-0 transition group-hover/msg:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(m.content);
                              setCopiedId(m.id ?? String(i));
                              setTimeout(() => setCopiedId(null), 1600);
                            }}
                            title={copiedId === (m.id ?? String(i)) ? t("chat.copied") : t("chat.copy")}
                            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                          >
                            <Copy size={13} />
                            {copiedId === (m.id ?? String(i)) ? t("chat.copied") : t("chat.copy")}
                          </button>
                          {i === messages.length - 1 && !streaming ? (
                            <button
                              onClick={() => void send(m.content, currentModel, [], { regenerate: true })}
                              title={t("chat.regenerate")}
                              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
                            >
                              <ArrowsClockwise size={13} /> {t("chat.regenerate")}
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {toolSteps.length > 0 ? (() => {
              const st = toolSteps[Math.min(stepIdx, toolSteps.length - 1)];
              const dot =
                st.status === "gagal"
                  ? "text-[var(--danger)]"
                  : st.status === "selesai"
                    ? "text-[var(--accent)]"
                    : "animate-pulse text-[var(--accent)]";
              return (
                <div key={stepIdx} className="fade-up mb-5 flex items-center gap-2">
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[11px] text-[var(--muted)]">
                    <span aria-hidden className={dot}>●</span>
                    <span className="truncate">{shortStepLabel(st.label)}</span>
                  </span>
                </div>
              );
            })() : null}

            {streaming && !streamText && ackPhase === 0 ? (
              <div className="mb-7 flex items-start gap-3.5">
                <span className="mt-0.5 hidden shrink-0 sm:block">
                  <BrandMark size={24} />
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="fade-up text-[15px] text-[var(--fg)]">
                    {t("chat.ack")}
                    <span className="caret" aria-hidden />
                  </p>
                </div>
              </div>
            ) : null}

            {streaming && !streamText && ackPhase === 1 ? (
              <div className="mb-7 flex items-start gap-3.5">
                <span className="mt-0.5 hidden shrink-0 sm:block">
                  <span className="block animate-pulse">
                    <BrandMark size={24} />
                  </span>
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-[15px] font-medium text-[var(--fg)]">{t("chat.thinking")}</p>
                  <p key={hintIdx} className="fade-up mt-1 text-sm text-[var(--muted)]">
                    {hints[hintIdx]}
                  </p>
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
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-[var(--faint)]">
                    <span className="font-medium">{modelLabel}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-[11px] normal-case tracking-normal">{t("chat.disclaimer")}</span>
                  </div>
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

      {readOnly ? null : (
        <div className="border-t border-[var(--border)] bg-[var(--bg)] px-5 pb-5 pt-4">
          <div className="mx-auto w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition focus-within:border-[var(--border-strong)] focus-within:shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
            {attachments.length > 0 ? (
              <div className="mb-2 px-1">
                <AttachmentPreview attachments={attachments} compact />
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

              <span className="hidden text-xs text-[var(--faint)] sm:inline">{t("landing.enterHint")}</span>

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
      )}
    </div>
  );
}

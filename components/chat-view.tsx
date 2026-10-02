// language: TypeScript, file: components/chat-view.tsx, target: client component
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsClockwise,
  ArrowUp,
  CaretRight,
  Check,
  CircleNotch,
  Copy,
  Image as ImageIcon,
  Paperclip,
  Plus,
  Prohibit,
  ShareNetwork,
  X,
  PencilSimple,
  Sun,
  Moon,
  ArrowDown,
} from "@phosphor-icons/react";
import Markdown from "./markdown";
import AttachmentPreview from "./attachment-preview";
import { BrandMark } from "./sidebar";
import ModelSelect, { MODELS, modelsFor, modelLabel as displayModel, type ModelOption } from "./model-select";
import { useI18n } from "./i18n";
import ToolCard, { type ToolStep } from "./tool-card";
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

/** segmen stream ala claude.ai: teks & kartu tool bergantian (bisa >1 putaran) */
type StreamPart = { k: "text"; v: string } | { k: "tools"; steps: ToolStep[] };

function unusedShortStepGuard(label: string): string {
  const m = label.match(/^(.*?)(https?:\/\/\S+)/);
  if (!m) return label;
  let host = "";
  try {
    host = new URL(m[2]).hostname.replace(/^www\./, "");
  } catch {
    return label;
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
  // stream dipecah jadi segmen bergantian: pembuka -> kartu -> hasil -> kartu -> …
  const [streamParts, setStreamParts] = useState<StreamPart[]>([]);
  /** tombol "Ke bawah": muncul saat user scroll jauh dari dasar */
  const [showJump, setShowJump] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  };
  // langkah tool realtime (gaya Claude.ai): ringkasan hitungan + daftar langkah terbuka
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
  // fase sebelum token pertama: 0 = baris ack "Saya cek dulu…", 1 = kartu thinking
  const [ackPhase, setAckPhase] = useState(0);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [shareOn, setShareOn] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  // server mengirim {type:"resume"} saat mendekati batas 300 dtk Vercel ->
  // loop di send() melanjutkan di request baru dari checkpoint (tanpa putus visual)
  const resumeRef = useRef(false);
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

  // tanpa autoscroll saat streaming — user bebas scroll ke atas.
  // scroll otomatis hanya saat pesan baru muncul; sisanya tombol "Ke bawah"
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
  }, [input]);


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
      const { classifyFile, isDocFile, extractDocText, compressImage, upscaleTiny } =
        await import("@/lib/attachments");
      const cls = classifyFile(file.name, file.type);
      if (cls === "unsupported") {
        setError(t("chat.attachUnsupported"));
        continue;
      }
      let data: string;
      if (cls === "image") {
        data = await upscaleTiny(await compressImage(file));
      } else if (isDocFile(file.name)) {
        const txt = await extractDocText(file);
        if (txt === null) {
          setError(t("chat.attachUnsupported"));
          continue;
        }
        data = txt;
      } else {
        data = await file.text();
      }
      setError("");
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

  async function callChat(
    payload: Record<string, unknown>,
    opts: { keepPanel?: boolean } = {},
  ): Promise<string> {
    setError("");
    resumeRef.current = false;
    setStreaming(true);
    setStreamParts([]);
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
          setError(
            body.kind === "sub_exhausted"
              ? t("chat.quotaSub")
              : body.kind === "weekly_exceeded"
                ? t("chat.quotaWeekly")
                : t("chat.quotaWindow5h"),
          );
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
              const step = JSON.parse(payload2) as ToolStep;
              // tool setelah teks = kartu BARU (riwayat bergantian ala claude.ai);
              // tool beruntun tanpa teks antaranya merge ke kartu terakhir
              setStreamParts((prev) => {
                const parts = [...prev];
                const last = parts[parts.length - 1];
                if (last && last.k === "tools") {
                  const steps = [...last.steps];
                  const idx = steps.map((x) => x.label).lastIndexOf(step.label);
                  if (idx >= 0) steps[idx] = step;
                  else steps.push(step);
                  parts[parts.length - 1] = { k: "tools", steps };
                } else {
                  parts.push({ k: "tools", steps: [step] });
                }
                return parts;
              });
            } catch {
              /* langkah tidak utuh */
            }
            continue;
          }
          evt = "";
          try {
            const obj = JSON.parse(payload2) as {
              type?: string;
              choices?: { delta?: { content?: string } }[];
            };
            if (obj.type === "resume") {
              resumeRef.current = true;
              continue;
            }
            const piece = obj.choices?.[0]?.delta?.content;
            if (typeof piece === "string") {
              acc += piece;
              setStreamParts((prev) => {
                const parts = [...prev];
                const last = parts[parts.length - 1];
                if (last && last.k === "text") parts[parts.length - 1] = { k: "text", v: last.v + piece };
                else parts.push({ k: "text", v: piece });
                return parts;
              });
            }
          } catch {
            /* potongan tidak utuh */
          }
        }
      }
      return acc;
    } catch (e) {
      if ((e as Error).name === "AbortError") resumeRef.current = false;
      else setError(t("chat.disconnected"));
      return "";
    } finally {
      if (ackTimerRef.current) {
        clearTimeout(ackTimerRef.current);
        ackTimerRef.current = null;
      }
      setStreamParts([]);
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

    let acc = await callChat({
      sessionId: sid,
      model: mdl,
      content,
      regenerate: opts.regenerate || undefined,
      editMessageId: editedId,
      attachments: files.length > 0 ? files : undefined,
    });
    // auto-resume lintas request: riwayat + hasil tool ada di checkpoint server,
    // jadi tugas panjang terus berjalan melewati batas 300 dtk per request
    for (let i = 0; i < 4 && resumeRef.current; i++) {
      resumeRef.current = false;
      const part = await callChat(
        { sessionId: sid, model: mdl, content: "", resume: true },
        { keepPanel: true },
      );
      acc = acc ? (part ? `${acc}\n\n${part}` : acc) : part;
    }
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

  const empty = messages.length === 0 && !streaming && streamParts.length === 0;
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  }, [messages]);
  const modelLabel = options.find((m) => m.id === currentModel)?.label ?? currentModel;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="chat-header relative flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-3 backdrop-blur-md sm:px-5">
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
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={t("nav.theme")}
              title={t("nav.theme")}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
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
            {/* mobile: tetap di alur kanan; desktop: di tengah header (ala Gemini) */}
            <div className="sm:hidden">
              <ModelSelect
                value={currentModel}
                onChange={persistModel}
                lockedIds={lockedIds}
                label={t("profile.model")}
                direction="down"
                models={options}
              />
            </div>
            <div className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 sm:block">
              <ModelSelect
                value={currentModel}
                onChange={persistModel}
                lockedIds={lockedIds}
                label={t("profile.model")}
                direction="down"
                models={options}
              />
            </div>
          </>
        )}
      </header>

      {readOnly ? (
        <div className="border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-2 text-center text-xs text-[var(--muted)]">
          {t("chat.readOnlyBanner")}
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
        }}
      >
        {empty ? (
          <div className="mx-auto flex h-full w-full max-w-3xl flex-col justify-center px-5 py-10 sm:px-8">
            <div className="fade-up">
              <BrandMark size={30} />
              <h2 className="brand-gradient mt-5 text-[24px] font-semibold tracking-tight sm:text-[30px]">
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
                    <div className="max-w-[86%] rounded-3xl border border-[var(--border)] bg-[var(--sidebar)] px-4 py-2.5 text-[15px]">
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

            {/* urutan ala claude.ai: kalimat pembuka -> kartu tool -> hasil */}
            {streaming && streamParts.length === 0 && ackPhase === 0 ? (
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
            {/* stream bergantian: teks pembuka -> kartu tool -> teks hasil -> kartu baru -> … */}
            {streamParts.map((p, i) => {
              const isLast = i === streamParts.length - 1;
              if (p.k === "tools") {
                return <ToolCard key={`t${i}`} steps={p.steps} live={streaming && isLast} />;
              }
              return (
                <div key={`x${i}`} className="mb-7 flex gap-3.5">
                  <span className="mt-0.5 hidden shrink-0 sm:block">
                    <BrandMark size={24} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Markdown>{p.v}</Markdown>
                    {streaming && isLast ? <span className="caret" aria-hidden /> : null}
                    {isLast ? (
                      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[10px] uppercase tracking-wider text-[var(--faint)]">
                        <span className="font-medium">{modelLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[11px] normal-case tracking-normal">
                          {t("chat.disclaimer")}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {streaming && streamParts.length === 0 && ackPhase === 1 ? (
              <div className="mb-7 flex items-center gap-2">
                <span className="sr-only" role="status">
                  {t("chat.thinking")}
                </span>
                <span aria-hidden className="tdots tdots-lg text-[var(--accent-ink)]">
                  <i />
                  <i />
                  <i />
                </span>
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
        <div className="relative border-t border-[var(--border)] bg-[var(--bg)] px-5 pb-5 pt-4">
          {showJump ? (
            <button
              type="button"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
              aria-label={t("chat.jumpBottom")}
              className="fade-up absolute -top-4 right-6 z-10 flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--muted)] shadow-[0_8px_24px_-10px_rgba(0,0,0,0.45)] transition hover:text-[var(--fg)]"
            >
              <ArrowDown size={13} />
              {t("chat.jumpBottom")}
            </button>
          ) : null}
          <div className="mx-auto w-full max-w-3xl rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_6px_18px_rgba(0,0,0,0.05)] transition focus-within:border-[var(--border-strong)] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.10),0_10px_28px_rgba(0,0,0,0.08)]">
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

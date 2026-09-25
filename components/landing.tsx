// language: TypeScript, file: components/landing.tsx, target: client component
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Code, Image as ImageIcon, Lightning, Moon, Paperclip, Sun, TextAlignLeft, X } from "@phosphor-icons/react";
import { BrandMark } from "./sidebar";
import ModelSelect, { MODELS, modelsFor, type ModelOption } from "./model-select";
import { useI18n } from "./i18n";
import { classifyFile, MAX_MB, type Attachment } from "@/lib/attachments";

export default function Landing({ username }: { username: string }) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [text, setText] = useState("");
  const [name, setName] = useState(username);
  const [model, setModel] = useState<string>(MODELS[0].id);
  const [lockedIds, setLockedIds] = useState<string[]>([]);
  const [options, setOptions] = useState<ModelOption[]>([...MODELS]);
  const [dark, setDark] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachMenu, setAttachMenu] = useState(false);
  const [error, setError] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, [lang]);

  // nama ikut profil (basi kalau user ganti username tanpa reload)
  useEffect(() => {
    const sync = () =>
      fetch("/api/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { user?: { username?: string } } | null) => {
          if (b?.user?.username) setName(b.user.username);
        })
        .catch(() => {});
    sync();
    window.addEventListener("profile-changed", sync);
    // daftar model dipangkas sesuai paket
    fetch("/api/subscriptions/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { models?: string[]; plan?: string } | null) => {
        if (!b?.models?.length) return;
        const allowed = MODELS.filter((m) => b.models!.includes(m.id));
        if (allowed.length) {
          // ketiga model tetap ditampil; yang di luar paket dikunci berlabel Pro/Max
          setOptions([...MODELS]);
          setLockedIds(MODELS.filter((m) => !b.models!.includes(m.id)).map((m) => m.id));
          setModel((cur) => (allowed.some((m) => m.id === cur) ? cur : allowed[0].id));
        }
      })
      .catch(() => {});
    return () => window.removeEventListener("profile-changed", sync);
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [text]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  }

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
      setError("");
      const data =
        cls === "image"
          ? await (async () => {
              // kecilkan dulu (foto besar >1,5 jt karakter dilepas server -> model minta kirim ulang)
              // lalu gambar kecil dinaikkan (upstream vision buta di bawah ~64px)
              const { compressImage, upscaleTiny } = await import("@/lib/attachments");
              return upscaleTiny(await compressImage(file));
            })()
          : await file.text();
      setAttachments((prev) =>
        prev.length >= 6
          ? prev
          : [...prev, { name: file.name, kind: cls === "image" ? "image" : "text", mime: file.type || "text/plain", data }],
      );
    }
  }

  function submit() {
    const content = text.trim();
    if (!content && attachments.length === 0) return;
    // lampiran ikut lewat draft (base64/teks) supaya halaman /c/new langsung mengirim
    sessionStorage.setItem(
      "draft",
      JSON.stringify({ content, model, attachments }),
    );
    router.push("/c/new");
  }

  const STARTERS = [
    { icon: Lightning, key: "landing.starter1" },
    { icon: Code, key: "landing.starter2" },
    { icon: TextAlignLeft, key: "landing.starter3" },
  ];

  return (
    <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="fade-up">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <div className="mb-5 flex items-center gap-2.5 md:hidden">
                <BrandMark size={22} />
                <span className="text-sm font-semibold tracking-tight">OnheilAI</span>
              </div>
              <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight sm:text-[34px]">
                {t("landing.greeting", { name })}
              </h1>
              <p className="mt-2.5 max-w-[52ch] text-[15px] text-[var(--muted)]">{t("landing.sub")}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="mt-1 shrink-0 rounded-full border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
              title={dark ? t("landing.modeLight") : t("landing.modeDark")}
              aria-label={dark ? t("landing.modeLight") : t("landing.modeDark")}
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition focus-within:border-[var(--border-strong)] focus-within:shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
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
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={2}
              placeholder={t("landing.placeholder")}
              className="max-h-[200px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none"
            />

            <div className="mt-1 flex items-center gap-2 px-1">
              <div className="relative">
                <button
                  onClick={() => setAttachMenu((v) => !v)}
                  aria-label={t("chat.attach")}
                  title={t("chat.attach")}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
                >
                  <Paperclip size={15} />
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

              <ModelSelect value={model} onChange={(m) => { setModel(m); try { localStorage.setItem("onheil.model", m); } catch { /* storage diblokir */ } }} label={t("profile.model")} models={options} lockedIds={lockedIds} />

              <span className="hidden text-xs text-[var(--faint)] sm:inline">{t("landing.enterHint")}</span>

              <button
                onClick={submit}
                disabled={!text.trim() && attachments.length === 0}
                aria-label={t("chat.send")}
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] transition hover:brightness-95 active:scale-95 disabled:opacity-35"
              >
                <ArrowUp size={17} weight="bold" />
              </button>
            </div>

            {error ? <p className="mt-2 px-1 text-xs text-[var(--danger)]">{error}</p> : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.map(({ icon: Icon, key }) => (
              <button
                key={key}
                onClick={() => setText(t(key))}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3.5 py-2 text-[13px] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)] active:scale-[0.98]"
              >
                <Icon size={14} />
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

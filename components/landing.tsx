// language: TypeScript, file: components/landing.tsx, target: client component
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Code, Lightning, Moon, Sun, TextAlignLeft } from "@phosphor-icons/react";
import { BrandMark } from "./sidebar";

const DEFAULT_MODEL = "onheil-1.1-luna";

const STARTERS = [
  { icon: Lightning, label: "Jelaskan konsep dengan contoh singkat" },
  { icon: Code, label: "Tulis kode untuk tugas saya" },
  { icon: TextAlignLeft, label: "Ringkas teks panjang jadi poin" },
];

export default function Landing({ username }: { username: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [dark, setDark] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((b: { models?: { id: string; label: string }[] }) => {
        if (b.models?.length) {
          setModels(b.models);
          if (!b.models.some((m) => m.id === DEFAULT_MODEL)) setModel(b.models[0].id);
        }
      })
      .catch(() => {});
    setDark(document.documentElement.classList.contains("dark"));
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

  function submit() {
    const content = text.trim();
    if (!content) return;
    sessionStorage.setItem("draft", JSON.stringify({ content, model }));
    router.push("/c/new");
  }

  return (
    <div className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="fade-up">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div>
              <div className="mb-5 flex items-center gap-2.5 sm:hidden">
                <BrandMark size={22} />
                <span className="text-sm font-semibold tracking-tight">AI</span>
              </div>
              <h1 className="text-[26px] font-semibold leading-[1.15] tracking-tight sm:text-[34px]">
                Mau kerjakan apa,
                <br className="hidden sm:block" /> {username}?
              </h1>
              <p className="mt-2.5 max-w-[52ch] text-[15px] text-[var(--muted)]">
                Tulis di bawah untuk mulai. Setiap percakapan jadi sesi sendiri dan tersimpan.
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="mt-1 shrink-0 rounded-full border border-[var(--border)] p-2 text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
              title={dark ? "Mode terang" : "Mode gelap"}
              aria-label="Ganti tema"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition focus-within:border-[var(--border-strong)] focus-within:shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
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
              placeholder="Tulis pesan…"
              className="max-h-[200px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-[var(--fg)] placeholder:text-[var(--muted)] focus:outline-none"
            />
            <div className="mt-1 flex items-center gap-2 px-1">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                aria-label="Pilih model"
                className="max-w-[210px] truncate rounded-full border border-[var(--border)] bg-[var(--sidebar)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--fg)] focus:outline-none"
              >
                {(models.length ? models : [{ id: DEFAULT_MODEL, label: DEFAULT_MODEL }]).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>

              <span className="hidden text-xs text-[var(--faint)] sm:inline">
                Enter kirim, Shift+Enter baris baru
              </span>

              <button
                onClick={submit}
                disabled={!text.trim()}
                aria-label="Kirim pesan"
                className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-fg)] transition hover:brightness-95 active:scale-95 disabled:opacity-35"
              >
                <ArrowUp size={17} weight="bold" />
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {STARTERS.map(({ icon: Icon, label }) => (
              <button
                key={label}
                onClick={() => setText(label)}
                className="flex items-center gap-2 rounded-full border border-[var(--border)] px-3.5 py-2 text-[13px] text-[var(--muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)] active:scale-[0.98]"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

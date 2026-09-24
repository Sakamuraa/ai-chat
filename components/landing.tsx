// language: TypeScript, file: components/landing.tsx, target: client component
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_MODEL = "onheil-1.1-luna";

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
    ta.style.height = `${Math.min(ta.scrollHeight, 220)}px`;
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

  const suggestions = ["Jelaskan konsep dengan contoh", "Tulis kode untuk", "Ringkas teks berikut"];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
      <div className="w-full max-w-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-2xl font-semibold sm:text-3xl">Ada yang bisa kubantu, {username}?</h1>
          <button
            onClick={toggleTheme}
            className="ml-3 shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
            title="Ganti tema"
          >
            {dark ? "☀" : "☾"}
          </button>
        </div>
        <p className="mb-6 text-sm text-[var(--muted)]">Mulai chat baru — sesi tersimpan otomatis.</p>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--sidebar)] p-3 shadow-sm">
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
            placeholder="Kirim pesan…"
            className="max-h-[220px] w-full resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
          />
          <div className="flex items-center gap-2 px-1 pt-1">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="max-w-[220px] truncate rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-xs outline-none focus:border-[#facc15]"
            >
              {(models.length ? models : [{ id: DEFAULT_MODEL, label: DEFAULT_MODEL }]).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="ml-auto">
              <button
                onClick={submit}
                disabled={!text.trim()}
                className="rounded-lg bg-[#facc15] px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-40"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setText(s)}
              className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[#facc15] hover:text-[var(--fg)]"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// language: TypeScript, file: components/model-select.tsx, target: dropdown custom (bukan <select>)
// Daftar model DIPATOK dua: onheil-1.1-luna & onheil-1.5-selenia (keputusan Manuel, jangan tarik /api/models).
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CaretUpDown } from "@phosphor-icons/react";

export const MODELS = [
  { id: "onheil-1.1-luna", label: "Onheil 1.1 Luna" },
  { id: "onheil-1.5-selenia", label: "Onheil 1.5 Selenia" },
  { id: "onheil-2-asteria", label: "Onheil 2 Asteria" },
] as const;

export function modelsFor(plan: string): ModelOption[] {
  if (plan === "max") return [...MODELS];
  if (plan === "pro") return MODELS.filter((m) => m.id !== "onheil-2-asteria");
  return MODELS.filter((m) => m.id === "onheil-1.1-luna");
}

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.label ?? id;
}

export type ModelOption = { id: string; label: string };

export default function ModelSelect({
  value,
  onChange,
  label,
  direction = "up",
  models = MODELS,
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** "up" untuk composer di bawah, "down" untuk bar judul di atas (kalau atas: keluar layar) */
  direction?: "up" | "down";
  /** daftar yang boleh dipakai — dipangkas sesuai paket (free/pro/max) */
  models?: readonly ModelOption[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = modelLabel(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] py-1.5 pl-3 pr-2.5 text-xs font-medium text-[var(--muted)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[var(--border-strong)] hover:text-[var(--fg)]"
      >
        <span className="max-w-[150px] truncate">{current}</span>
        <CaretUpDown size={13} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open ? (
        <div
          role="listbox"
          className={`fade-up absolute right-0 z-30 w-[248px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)] ${
            direction === "up" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
          }`}
        >
          {models.map((m) => {
            const active = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  active ? "bg-[var(--accent-soft)] text-[var(--fg)]" : "text-[var(--muted)] hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.label}</span>
                  <span className="block truncate text-[11px] text-[var(--faint)]">{m.id}</span>
                </span>
                {active ? <Check size={15} weight="bold" className="shrink-0 text-[#a16207] dark:text-[var(--accent)]" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// language: TypeScript, file: components/model-select.tsx, target: dropdown custom (bukan <select>)
// Ketiga model SELALU tampil; yang di luar paket diberi label Pro/Max dan tidak bisa dipilih.
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CaretUpDown, LockSimple } from "@phosphor-icons/react";
import { MODEL_BADGE, isPlan, allowedModels } from "@/lib/plans";

export const MODELS = [
  { id: "onheil-1.1-luna", label: "Onheil 1.1 Luna" },
  { id: "onheil-1.5-selenia", label: "Onheil 1.5 Selenia" },
  { id: "onheil-1.5-solaria", label: "Onheil 1.5 Solaria" },
  { id: "onheil-2-asteria", label: "Onheil 2 Asteria" },
  { id: "onheil-2.5-celestia", label: "Onheil 2.5 Celestia" },
] as const;

export function modelsFor(plan: string): ModelOption[] {
  const allowed = allowedModels(isPlan(plan) ? plan : "free");
  return MODELS.filter((m) => allowed.includes(m.id));
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
  lockedIds = [],
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** "up" untuk composer di bawah, "down" untuk bar judul di atas (kalau atas: keluar layar) */
  direction?: "up" | "down";
  /** daftar yang ditampilkan — default ketiga model, tidak dipangkas */
  models?: readonly ModelOption[];
  /** id model di luar paket user: tampil berlabel, tidak bisa dipilih */
  lockedIds?: readonly string[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = modelLabel(value);
  const currentValueBadge = MODEL_BADGE[value] ?? "";
  const isLocked = (id: string) => lockedIds.includes(id);

  useEffect(() => {
    if (!open) return;
    // pointerdown menutup lebih andal di sentuhan (mousedown kadang datang terlambat di mobile)
    const onDoc = (e: Event) => {
      const node = e.target as Node | null;
      if (box.current && node && !box.current.contains(node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
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
        {currentValueBadge ? <Badge text={currentValueBadge} /> : null}
        <CaretUpDown size={13} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open ? (
        <div
          role="listbox"
          className={`fade-up absolute right-0 z-50 max-h-[60dvh] w-[262px] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--panel)] p-1 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28)] [touch-action:manipulation] ${
            direction === "up" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
          }`}
        >
          {models.map((m) => {
            const active = m.id === value;
            const locked = isLocked(m.id);
            const badge = MODEL_BADGE[m.id] ?? "";
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={active}
                aria-disabled={locked}
                title={locked ? `${badge}` : undefined}
                onClick={() => {
                  if (locked) return; // terkunci: hanya ditampilkan berlabel
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-[var(--fg)]"
                    : locked
                      ? "cursor-not-allowed text-[var(--faint)]"
                      : "text-[var(--muted)] hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{m.label}</span>
                    {badge ? <Badge text={badge} /> : null}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--faint)]">{m.id}</span>
                </span>
                {locked ? <LockSimple size={14} className="shrink-0" /> : null}
                {active && !locked ? (
                  <Check size={15} weight="bold" className="shrink-0 text-[#a16207] dark:text-[var(--accent)]" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** label paket kecil di samping nama model */
function Badge({ text }: { text: string }) {
  return (
    <span className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
      {text}
    </span>
  );
}

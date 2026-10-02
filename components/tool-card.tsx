// language: TypeScript, file: components/tool-card.tsx, target: kartu langkah tool ala claude.ai
"use client";

import { useState } from "react";
import { CaretRight, Check, CircleNotch, X } from "@phosphor-icons/react";
import { useI18n } from "./i18n";

export type ToolStep = { name?: string; label: string; status: string };

/** "membaca https://game8.co/games/..." -> "membaca game8.co" (baris tetap satu) */
function shortStepLabel(label: string): string {
  const m = label.match(/^(.*?)(https?:\/\/\S+)/);
  if (!m) return label;
  let host = "";
  try {
    host = new URL(m[2]).hostname.replace(/^www\./, "");
  } catch {
    return label;
  }
  return `${m[1].trim()} ${host}`;
}

/**
 * Kartu langkah tool, pola claude.ai:
 * - header ringkasan hitungan ("Menjalankan 4 perintah, membaca 2 berkas, …")
 * - daftar langkah TERBUKA default; tiap langkah bisa di-expand utk detail
 *   (nama tool + label penuh + status)
 * - kartu terakhir saat streaming dgn spinner + titik pantul
 */
export default function ToolCard({ steps, live = false }: { steps: ToolStep[]; live?: boolean }) {
  const { t } = useI18n();
  const [openList, setOpenList] = useState(true);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  // hitungan gaya Claude.ai: "Menjalankan 4 perintah, membaca 2 berkas, …"
  const c = { run: 0, read: 0, search: 0, make: 0, other: 0 };
  for (const s of steps) {
    if (s.label.startsWith("menjalankan")) c.run++;
    else if (s.label.startsWith("membaca") || s.label.startsWith("fetch")) c.read++;
    else if (s.label.startsWith("mencari")) c.search++;
    else if (s.label.startsWith("membuat")) c.make++;
    else c.other++;
  }
  const parts: string[] = [];
  if (c.run) parts.push(t("chat.sum.run", { n: c.run }));
  if (c.read) parts.push(t("chat.sum.read", { n: c.read }));
  if (c.search) parts.push(t("chat.sum.search", { n: c.search }));
  if (c.make) parts.push(t("chat.sum.make", { n: c.make }));
  if (c.other) parts.push(t("chat.sum.other", { n: c.other }));

  return (
    <div className="mb-5 max-w-full rounded-xl border border-[var(--border)] bg-[var(--sidebar)] px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpenList((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-xs text-[var(--muted)] transition hover:text-[var(--fg)]"
      >
        <CaretRight
          size={12}
          className={`shrink-0 transition-transform ${openList ? "rotate-90" : ""}`}
        />
        {live ? (
          <CircleNotch size={12} className="shrink-0 animate-spin text-[var(--accent-ink)]" />
        ) : (
          <span aria-hidden className="shrink-0 text-[var(--accent-ink)]">
            ●
          </span>
        )}
        <span className="truncate">{parts.join(", ")}</span>
        {live ? (
          <span aria-hidden className="tdots shrink-0 text-[var(--accent-ink)]">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--faint)]">
          {steps.length}
        </span>
      </button>
      {openList ? (
        <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
          {steps.map((st, i) => {
            const open = openIdx === i;
            return (
              <li key={`${st.label}-${i}`}>
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? null : i)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[11px] transition hover:bg-[var(--border)]/45"
                >
                  {st.status === "gagal" ? (
                    <X size={12} weight="bold" className="shrink-0 text-[var(--danger)]" />
                  ) : st.status === "selesai" ? (
                    <Check size={12} weight="bold" className="shrink-0 text-[var(--accent-ink)]" />
                  ) : (
                    <CircleNotch size={12} className="shrink-0 animate-spin text-[var(--accent-ink)]" />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      st.status === "gagal" ? "text-[var(--danger)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {shortStepLabel(st.label)}
                  </span>
                  <CaretRight
                    size={10}
                    className={`shrink-0 text-[var(--faint)] transition-transform ${open ? "rotate-90" : ""}`}
                  />
                </button>
                {open ? (
                  <div className="mb-1 ml-5 mt-1 space-y-1 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-[11px] leading-relaxed">
                    {st.name ? (
                      <p className="font-medium text-[var(--fg)]">{st.name}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-all text-[var(--muted)]">{st.label}</p>
                    <p className="text-[10px] uppercase tracking-wide text-[var(--faint)]">
                      {st.status}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

// language: TypeScript, file: components/welcome-modal.tsx, target: popup "Welcome" sekali per sesi tab (sessionStorage)
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BrandMark } from "./sidebar";

const STORAGE_KEY = "onheil_welcome_seen";

export default function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return; // sudah pernah lihat di sesi tab ini
      sessionStorage.setItem(STORAGE_KEY, "1");
      setOpen(true);
    } catch {
      /* storage diblokir (private mode) — popup dilewati, jangan pernah halang alur */
    }
  }, []);

  if (!open) return null;

  const dismiss = () => setOpen(false);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome"
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={dismiss} />
      <div className="fade-up relative z-10 w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-3">
          <BrandMark size={32} />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">Welcome!</h2>
            <p className="text-sm text-[var(--muted)]">Selamat datang di OnheilAI, Tuanku.</p>
          </div>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-[var(--muted)]">
          Sesi chat tersimpan otomatis, banyak model bisa dipilih, dokumen (PDF/DOCX/ZIP) dan
          analisis gambar bisa langsung dibuat dari percakapan. Baru pertama kali? Panduan
          singkat ada di Docs.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] transition hover:opacity-90"
          >
            Mulai Ngobrol
          </button>
          <Link
            href="/docs"
            onClick={dismiss}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--fg)] transition hover:bg-[var(--accent-soft)]"
          >
            📄 Docs
          </Link>
          <Link
            href="/docs/privacy"
            onClick={dismiss}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--fg)] transition hover:bg-[var(--accent-soft)]"
          >
            Privasi
          </Link>
          <Link
            href="/docs/terms"
            onClick={dismiss}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--fg)] transition hover:bg-[var(--accent-soft)]"
          >
            Ketentuan
          </Link>
        </div>
      </div>
    </div>
  );
}

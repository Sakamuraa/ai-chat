// language: TypeScript, file: app/not-found.tsx, target: Next.js (client — Phosphor pakai context)
"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { BrandMark } from "@/components/sidebar";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <BrandMark size={28} />
        <h1 className="mt-5 text-[24px] font-semibold tracking-tight">Sesi tidak ditemukan</h1>
        <p className="mt-2 text-[15px] text-[var(--muted)]">
          Sesi ini bukan milik kamu, sudah dihapus, atau tautannya salah.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-95 active:scale-[0.98]"
        >
          <ArrowLeft size={15} weight="bold" />
          Chat baru
        </Link>
      </div>
    </div>
  );
}

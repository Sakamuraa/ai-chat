// language: TypeScript (Next.js), file: app/docs/layout.tsx, target: shell halaman bantuan ai.onheil.fun
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bantuan OnheilAI",
  description: "Dokumentasi model OnheilAI, kebijakan privasi, dan ketentuan layanan.",
};

const NAV = [
  { href: "/docs", label: "Dokumentasi model" },
  { href: "/docs/privacy", label: "Kebijakan privasi" },
  { href: "/docs/terms", label: "Ketentuan layanan" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    // shell root memakai h-dvh + overflow-hidden (khas app chat), jadi halaman bantuan
    // wajib membawa wadah scroll sendiri agar konten panjang bisa digulir, terutama di HP.
    <div className="h-full overflow-y-auto overscroll-contain bg-[var(--bg)] text-[var(--fg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1100px] items-center gap-6 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] bg-[var(--accent)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="OnheilAI" className="h-full w-full object-contain" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">OnheilAI</span>
          </Link>

          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] transition hover:bg-[var(--border)]/60 hover:text-[var(--fg)]"
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/"
            className="ml-auto shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] transition active:scale-[0.98]"
          >
            Kembali ke chat
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 pb-24 pt-10">{children}</main>

      <footer className="border-t border-[var(--border)] py-8">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-2 px-5 text-[13px] text-[var(--faint)] sm:flex-row sm:items-center sm:justify-between">
          <span>OnheilAI oleh The Onheil Foundation</span>
          <span className="flex gap-4">
            <Link href="/docs/privacy" className="transition hover:text-[var(--fg)]">
              Kebijakan privasi
            </Link>
            <Link href="/docs/terms" className="transition hover:text-[var(--fg)]">
              Ketentuan layanan
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

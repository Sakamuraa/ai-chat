// language: TypeScript (React), file: components/account-modal.tsx, target: Next.js app ai.onheil.fun
// Modal akun ala ChatGPT: ganti akun, upgrade, pengaturan, bantuan, keluar.
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsLeftRight,
  Gear,
  Lifebuoy,
  SignOut,
  Sparkle,
  BookOpen,
  ShieldCheck,
  FileText,
  X,
} from "@phosphor-icons/react";
import { useI18n } from "./i18n";
import { PLANS, type Plan } from "@/lib/plans";

/** Invite Discord The Onheil Foundation (permintaan Manuel, 2026-09-26). */
const DISCORD_UPGRADE = "https://discord.gg/ytBsd5JSXB";

type Me = { username?: string; email?: string | null; plan?: string | null };

export function AccountModal({
  open,
  onClose,
  onSettings,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  onSettings: () => void;
  onLogout: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { user?: Me } | null) => {
        if (alive && b?.user) setMe(b.user);
      })
      .catch(() => undefined);
    // paket efektif (akun + langganan aktif) -> label badge
    fetch("/api/subscriptions/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { plan?: string } | null) => {
        if (alive && b?.plan) setMe((prev) => ({ ...(prev ?? {}), plan: b.plan ?? null }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  // tutup dengan Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const planId: Plan = (PLANS.some((p) => p.id === me?.plan) ? me?.plan : "free") as Plan;
  const planLabel = PLANS.find((p) => p.id === planId)?.label ?? "Standard";
  const name = me?.username || "";
  const initial = (name.trim()[0] || "O").toUpperCase();

  const row = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    opts?: { external?: boolean; tone?: "accent" | "danger" },
  ) => (
    <button
      key={label}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[var(--border)]/60 ${
        opts?.tone === "accent"
          ? "text-[var(--accent)] hover:text-[var(--accent)]"
          : opts?.tone === "danger"
            ? "text-[var(--danger)] hover:text-[var(--danger)]"
            : "text-[var(--fg)]"
      }`}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {opts?.external ? (
        <span className="text-[11px] text-[var(--faint)]">buka</span>
      ) : null}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("account.title")}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/55" />
      <div
        className="fade-up relative z-10 w-full max-w-[340px] rounded-t-2xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.45)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* kepala akun */}
        <div className="flex items-center gap-3 px-3 pb-2 pt-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--border)] text-sm font-semibold text-[var(--fg)]">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-[var(--muted)]">
              {me?.email || planLabel}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
            {planLabel}
          </span>
          <button
            onClick={onClose}
            aria-label={t("nav.close")}
            className="rounded-full p-1 text-[var(--muted)] transition hover:bg-[var(--border)] hover:text-[var(--fg)]"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        <div className="space-y-0.5">
          {row(
            <ArrowsLeftRight size={16} />,
            t("account.switch"),
            () => {
              onClose();
              router.push("/login");
            },
          )}
          {row(
            <Sparkle size={16} />,
            t("account.upgrade"),
            () => window.open(DISCORD_UPGRADE, "_blank", "noopener,noreferrer"),
            { external: true, tone: "accent" },
          )}
          {row(
            <Gear size={16} />,
            t("account.settings"),
            () => {
              onClose();
              onSettings();
            },
          )}
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        <div className="space-y-0.5">
          <p className="flex items-center gap-3 px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--faint)]">
            <Lifebuoy size={14} />
            {t("account.help")}
          </p>
          {row(
            <BookOpen size={16} />,
            t("account.docs"),
            () => {
              onClose();
              router.push("/docs");
            },
          )}
          {row(
            <ShieldCheck size={16} />,
            t("account.privacy"),
            () => {
              onClose();
              router.push("/docs/privacy");
            },
          )}
          {row(
            <FileText size={16} />,
            t("account.terms"),
            () => {
              onClose();
              router.push("/docs/terms");
            },
          )}
        </div>

        <div className="my-1 h-px bg-[var(--border)]" />

        {row(<SignOut size={16} />, t("account.logout"), onLogout, { tone: "danger" })}
      </div>
    </div>
  );
}
